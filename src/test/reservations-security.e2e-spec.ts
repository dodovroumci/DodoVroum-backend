import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { TestData, TestUtils } from './test-utils';

/**
 * S-0bis, à travers HTTP : GET /api/reservations scopé par rôle, DELETE /api/reservations/:id
 * réservé à l'admin, calendriers publics des dates bloquées limités à { id, startDate, endDate }.
 *
 * Toutes les données sont créées par l'API à partir du seed du fichier (comptes et biens taggés).
 * Aucune assertion ne porte sur un nombre absolu ni sur l'ordre : la base peut contenir d'autres données.
 */
describe('Sécurité des réservations S-0bis (e2e)', () => {
  let app: INestApplication;
  let testData: TestData;
  const tokens: Record<'admin' | 'client' | 'otherClient' | 'owner', string> = {
    admin: '',
    client: '',
    otherClient: '',
    owner: '',
  };

  // Réservations taggées (via les comptes du seed)
  let clientBookingId: string; // client, résidence du propriétaire
  let otherClientBookingId: string; // autre client, véhicule du propriétaire
  let offerBookingId: string; // client, offre combinée du propriétaire (crée des blocages avec bookingId)
  let protectedBookingId: string; // cible des DELETE refusés
  let adminDeleteBookingId: string; // cible du DELETE admin

  // Bornes des blocages créés, pour les retrouver dans les calendriers publics
  const offerStay = { startDate: TestUtils.dateInDays(60), endDate: TestUtils.dateInDays(62) };
  const manualBlock = { startDate: TestUtils.dateInDays(80), endDate: TestUtils.dateInDays(82) };

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const idsOf = (body: unknown): string[] => {
    expect(Array.isArray(body)).toBe(true);
    return (body as Array<{ id: string }>).map(({ id }) => id);
  };
  const toSecond = (value: string) => Math.floor(new Date(value).getTime() / 1000);

  const createBooking = async (token: string, payload: Record<string, unknown>): Promise<string> => {
    const response = await http().post('/api/bookings').set(bearer(token)).send(payload).expect(201);
    expect(typeof response.body.id).toBe('string');
    return response.body.id;
  };

  beforeAll(async () => {
    app = await TestUtils.createTestApp();
    testData = await TestUtils.seedTestData();

    tokens.admin = await TestUtils.getAuthToken(app, testData.adminUser.email);
    tokens.client = await TestUtils.getAuthToken(app, testData.clientUser.email);
    tokens.otherClient = await TestUtils.getAuthToken(app, testData.otherClientUser.email);
    tokens.owner = await TestUtils.getAuthToken(app, testData.ownerUser.email);

    const residenceId = testData.testResidence.id;
    const vehicleId = testData.testVehicle.id;

    // Périodes disjointes : aucune ne déclenche le contrôle de chevauchement.
    clientBookingId = await createBooking(tokens.client, {
      residenceId,
      startDate: TestUtils.dateInDays(30),
      endDate: TestUtils.dateInDays(33),
    });
    otherClientBookingId = await createBooking(tokens.otherClient, {
      vehicleId,
      startDate: TestUtils.dateInDays(30),
      endDate: TestUtils.dateInDays(33),
    });
    protectedBookingId = await createBooking(tokens.client, {
      residenceId,
      startDate: TestUtils.dateInDays(40),
      endDate: TestUtils.dateInDays(42),
    });
    adminDeleteBookingId = await createBooking(tokens.client, {
      residenceId,
      startDate: TestUtils.dateInDays(44),
      endDate: TestUtils.dateInDays(46),
    });

    // Offre combinée du propriétaire : sa réservation bloque résidence et véhicule avec un bookingId.
    const offer = await http()
      .post('/api/offers')
      .set(bearer(tokens.owner))
      .send({
        title: 'Offre e2e S-0bis',
        description: 'Offre combinée de test',
        price: 150,
        nbJours: 2,
        residenceId,
        vehicleId,
        validFrom: TestUtils.dateInDays(1),
        validTo: TestUtils.dateInDays(120),
      })
      .expect(201);
    offerBookingId = await createBooking(tokens.client, { offerId: offer.body.id, ...offerStay });

    // Blocages manuels du propriétaire, avec une note privée (reason).
    for (const path of [`/api/residences/${residenceId}/blocked-dates`, `/api/vehicles/${vehicleId}/blocked-dates`]) {
      const blocked = await http()
        .post(path)
        .set(bearer(tokens.owner))
        .send({ ...manualBlock, reason: 'Note privée e2e' })
        .expect(201);
      // Précondition : la note privée est bien enregistrée, son absence publique n'est donc pas fortuite.
      expect(blocked.body.reason).toBe('Note privée e2e');
    }
  });

  afterAll(async () => {
    if (testData) await TestUtils.cleanupTestData(testData);
    if (app) await TestUtils.closeTestApp(app);
  });

  describe('GET /api/reservations', () => {
    it('sans jeton : 401', async () => {
      await http().get('/api/reservations').expect(401);
    });

    it('ADMIN : voit les réservations de tous les clients, sans données financières', async () => {
      const response = await http().get('/api/reservations').set(bearer(tokens.admin)).expect(200);
      const ids = idsOf(response.body);

      expect(ids).toEqual(expect.arrayContaining([clientBookingId, otherClientBookingId, offerBookingId]));
      const tagged = (response.body as Array<{ id: string }>).filter(({ id }) =>
        [clientBookingId, otherClientBookingId, offerBookingId].includes(id),
      );
      for (const booking of tagged) expect(booking).not.toHaveProperty('finance');
    });

    it('PROPRIETAIRE : voit les réservations de ses biens (résidence, véhicule, offre)', async () => {
      const response = await http().get('/api/reservations').set(bearer(tokens.owner)).expect(200);

      expect(idsOf(response.body)).toEqual(
        expect.arrayContaining([clientBookingId, otherClientBookingId, offerBookingId]),
      );
    });

    it('CLIENT : ne voit que ses propres réservations', async () => {
      const response = await http().get('/api/reservations').set(bearer(tokens.client)).expect(200);
      const ids = idsOf(response.body);

      expect(ids).toEqual(expect.arrayContaining([clientBookingId, offerBookingId]));
      expect(ids).not.toContain(otherClientBookingId);
    });

    it("CLIENT (autre) : ne voit pas les réservations d'un autre client", async () => {
      const response = await http().get('/api/reservations').set(bearer(tokens.otherClient)).expect(200);
      const ids = idsOf(response.body);

      expect(ids).toContain(otherClientBookingId);
      expect(ids).not.toContain(clientBookingId);
      expect(ids).not.toContain(offerBookingId);
    });

    it('rôle forgé dans le jeton : ignoré, le rôle vient de la base (périmètre client)', async () => {
      // Jeton valide pour le client, mais revendiquant un autre rôle : JwtStrategy relit l'utilisateur en base.
      const forged = await new JwtService().signAsync(
        { email: testData.clientUser.email, sub: testData.clientUser.id, role: 'SUPERADMIN', type: 'access' },
        { secret: process.env.JWT_SECRET, expiresIn: '5m' },
      );
      const response = await http().get('/api/reservations').set(bearer(forged)).expect(200);
      const ids = idsOf(response.body);

      expect(ids).toContain(clientBookingId);
      expect(ids).not.toContain(otherClientBookingId);
    });
  });

  describe('DELETE /api/reservations/:id', () => {
    const expectStillExists = async (id: string) => {
      const response = await http().get(`/api/reservations/${id}`).set(bearer(tokens.admin)).expect(200);
      expect(response.body.id).toBe(id);
    };

    it('sans jeton : 401, la réservation existe toujours', async () => {
      await http().delete(`/api/reservations/${protectedBookingId}`).expect(401);
      await expectStillExists(protectedBookingId);
    });

    it('CLIENT titulaire de la réservation : 403, la réservation existe toujours', async () => {
      await http().delete(`/api/reservations/${protectedBookingId}`).set(bearer(tokens.client)).expect(403);
      await expectStillExists(protectedBookingId);
    });

    it('PROPRIETAIRE du bien réservé : 403, la réservation existe toujours', async () => {
      await http().delete(`/api/reservations/${protectedBookingId}`).set(bearer(tokens.owner)).expect(403);
      await expectStillExists(protectedBookingId);
    });

    it('rôle ADMIN forgé dans le jeton d’un client : 403, la réservation existe toujours', async () => {
      const forged = await new JwtService().signAsync(
        { email: testData.clientUser.email, sub: testData.clientUser.id, role: 'ADMIN', type: 'access' },
        { secret: process.env.JWT_SECRET, expiresIn: '5m' },
      );
      await http().delete(`/api/reservations/${protectedBookingId}`).set(bearer(forged)).expect(403);
      await expectStillExists(protectedBookingId);
    });

    it('ADMIN : supprime une réservation du test', async () => {
      await http().delete(`/api/reservations/${adminDeleteBookingId}`).set(bearer(tokens.admin)).expect(200);
      await http().get(`/api/reservations/${adminDeleteBookingId}`).set(bearer(tokens.admin)).expect(404);
    });
  });

  describe.each([
    ['résidences', () => `/api/residences/${testData.testResidence.id}/blocked-dates`],
    ['véhicules', () => `/api/vehicles/${testData.testVehicle.id}/blocked-dates`],
  ])('GET blocked-dates public (%s)', (_label, pathOf) => {
    const PRIVATE_FIELDS = ['bookingId', 'reason', 'residenceId', 'vehicleId', 'createdAt', 'updatedAt'];

    const expectPublicShape = (body: unknown) => {
      expect(Array.isArray(body)).toBe(true);
      const entries = body as Array<Record<string, unknown>>;

      // Le bien appartient au test : toutes les entrées sont taggées. On retrouve les deux blocages créés.
      const starts = entries.map((entry) => toSecond(entry.startDate as string));
      expect(starts).toEqual(expect.arrayContaining([toSecond(offerStay.startDate), toSecond(manualBlock.startDate)]));

      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toEqual(['endDate', 'id', 'startDate']);
        for (const field of PRIVATE_FIELDS) expect(entry).not.toHaveProperty(field);
      }
    };

    it('sans jeton : uniquement id, startDate, endDate (ni bookingId ni reason)', async () => {
      const response = await http().get(pathOf()).expect(200);
      expectPublicShape(response.body);
    });

    it('avec le jeton du propriétaire : même réponse restreinte', async () => {
      const response = await http().get(pathOf()).set(bearer(tokens.owner)).expect(200);
      expectPublicShape(response.body);
    });
  });
});
