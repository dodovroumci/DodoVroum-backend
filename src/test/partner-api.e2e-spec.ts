import { createHash, randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestData, TestUtils } from './test-utils';

/**
 * API publique (/api/public/v1) et partenaire (/api/partner/v1) sur MySQL réel : requêtes Prisma
 * (filtres de relation, groupBy, collation), règle de disponibilité, authentification, quotas.
 * Les tests unitaires (src/partner-api) couvrent les mêmes règles avec une base simulée.
 * Préparations hors API par TestUtils uniquement (connexion vérifiée, données du fichier).
 */
const PARTNER_KEY = 'dvp_' + randomBytes(32).toString('base64url');

describe('API publique et partenaire des résidences (e2e)', () => {
  let app: INestApplication;
  let data: TestData;
  let previousKeys: string | undefined;
  let city: string;
  let visibleId: string;
  let suspendedId: string;

  const http = () => request(app.getHttpServer());
  const partner = (url: string) =>
    http().get(url).set('X-API-Key', PARTNER_KEY);
  const day = (days: number) => TestUtils.dateInDays(days).slice(0, 10);

  beforeAll(async () => {
    // Lue par PartnerApiKeyGuard à la création de l'application ; restaurée en fin de fichier.
    previousKeys = process.env.PARTNER_API_KEYS;
    process.env.PARTNER_API_KEYS = `e2etest:${createHash('sha256').update(PARTNER_KEY).digest('hex')}`;

    app = await TestUtils.createTestApp();
    data = await TestUtils.seedTestData();

    // Ville propre au fichier : les recherches ne voient pas les données des autres suites.
    city = `Ville${data.tag}`;
    const residence = {
      description: 'Description privée',
      address: '42 rue privée',
      latitude: 5.3,
      longitude: -4.0,
      city,
      country: 'Côte d’Ivoire',
      pricePerDay: 30000,
      capacity: 4,
      bedrooms: 2,
      bathrooms: 1,
      amenities: JSON.stringify(['WiFi', 'Piscine']),
      images: JSON.stringify([
        'https://dodovroum.com/storage/residences/photo1.jpg',
        'https://exemple.invalid/photo2.jpg',
      ]),
    };
    visibleId = (
      await TestUtils.createResidence(data, {
        ...residence,
        title: `Villa visible ${data.tag}`,
      })
    ).id;
    suspendedId = (
      await TestUtils.createResidence(data, {
        ...residence,
        title: `Villa suspendue ${data.tag}`,
        moderationStatus: 'SUSPENDED',
      })
    ).id;

    await TestUtils.addCompletedStayReview(data, visibleId, 4, 'Avis privé');
  });

  afterAll(async () => {
    if (data) await TestUtils.cleanupTestData(data);
    if (app) await TestUtils.closeTestApp(app);
    if (previousKeys === undefined) delete process.env.PARTNER_API_KEYS;
    else process.env.PARTNER_API_KEYS = previousKeys;
  });

  describe('API publique', () => {
    it('fiche : champs publics seulement, image hors stockage écartée, note agrégée', async () => {
      const res = await http()
        .get(`/api/public/v1/residences/${visibleId}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: visibleId,
        city,
        pricePerNight: { amount: 30000, currency: 'XOF' },
        coverImageUrl: 'https://dodovroum.com/storage/residences/photo1.jpg',
        images: ['https://dodovroum.com/storage/residences/photo1.jpg'],
        amenities: ['WiFi', 'Piscine'],
        rating: { average: 4, count: 1 },
        url: `https://dodovroum.com/r/${visibleId}`,
      });
      const body = JSON.stringify(res.body);
      for (const secret of [
        '42 rue privée',
        'Description privée',
        'Avis privé',
        'ownerId',
        'latitude',
        data.ownerUser.email,
      ]) {
        expect(body).not.toContain(secret);
      }
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('résidence non publiable et identifiant inconnu : même 404, non mis en cache', async () => {
      const suspended = await http()
        .get(`/api/public/v1/residences/${suspendedId}`)
        .expect(404);
      const unknown = await http()
        .get('/api/public/v1/residences/inconnu')
        .expect(404);

      const withoutRequestId = ({
        requestId,
        ...error
      }: Record<string, unknown>) => error;
      expect(withoutRequestId(suspended.body.error)).toEqual(
        withoutRequestId(unknown.body.error),
      );
      expect(suspended.body.error.code).toBe('RESIDENCE_NOT_FOUND');
      expect(suspended.headers['cache-control']).toBe('no-store');
    });

    it("aucune route d'écriture", async () => {
      await http()
        .post(`/api/public/v1/residences/${visibleId}`)
        .send({})
        .expect(404);
      await http()
        .delete(`/api/partner/v1/residences/${visibleId}`)
        .set('X-API-Key', PARTNER_KEY)
        .expect(404);
    });
  });

  describe('API partenaire', () => {
    it('clé absente ou inconnue, ou jeton utilisateur : 401', async () => {
      const missing = await http()
        .get('/api/partner/v1/residences')
        .expect(401);
      expect(missing.body.error.code).toBe('INVALID_API_KEY');
      await http()
        .get('/api/partner/v1/residences')
        .set('X-API-Key', 'dvp_' + 'A'.repeat(43))
        .expect(401);

      const adminToken = await TestUtils.getAuthToken(
        app,
        data.adminUser.email,
      );
      await http()
        .get('/api/partner/v1/residences')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
    });

    it('recherche : ville sans tenir compte de la casse, texte libre, résidence non publiable exclue', async () => {
      const byCity = await partner(
        `/api/partner/v1/residences?city=${city.toLowerCase()}`,
      ).expect(200);
      expect(byCity.body.data.map((r: { id: string }) => r.id)).toEqual([
        visibleId,
      ]);
      expect(byCity.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(byCity.headers['cache-control']).toBe('no-store');

      const byText = await partner(
        `/api/partner/v1/residences?q=${data.tag}&limit=50`,
      ).expect(200);
      expect(byText.body.data.map((r: { id: string }) => r.id)).toEqual([
        visibleId,
      ]);
    });

    it('paramètre inconnu ou incohérent : 400', async () => {
      const unknown = await partner(
        '/api/partner/v1/residences?isActive=false',
      ).expect(400);
      expect(unknown.body.error.code).toBe('INVALID_PARAMETER');
      await partner(`/api/partner/v1/residences?checkIn=${day(10)}`).expect(
        400,
      );
      const range = await partner(
        `/api/partner/v1/residences/${visibleId}/availability?checkIn=${day(10)}&checkOut=${day(9)}`,
      ).expect(400);
      expect(range.body.error.code).toBe('INVALID_DATE_RANGE');
    });

    it('fiche partenaire : même contenu que la fiche publique', async () => {
      const publicRes = await http()
        .get(`/api/public/v1/residences/${visibleId}`)
        .expect(200);
      const partnerRes = await partner(
        `/api/partner/v1/residences/${visibleId}`,
      ).expect(200);
      expect(partnerRes.body).toEqual(publicRes.body);
    });
  });

  describe('Compte du propriétaire', () => {
    it.each([
      ['désactivé', { isActive: false, deletedAt: null }],
      ['supprimé', { isActive: true, deletedAt: new Date() }],
    ])(
      'propriétaire %s : résidence introuvable partout (404, absente de la recherche)',
      async (_label, state) => {
        await TestUtils.setOwnerAccountState(data, state);
        try {
          await http()
            .get(`/api/public/v1/residences/${visibleId}`)
            .expect(404);
          await partner(`/api/partner/v1/residences/${visibleId}`).expect(404);
          await partner(
            `/api/partner/v1/residences/${visibleId}/availability?checkIn=${day(20)}&checkOut=${day(21)}`,
          ).expect(404);
          const search = await partner(
            `/api/partner/v1/residences?city=${city}`,
          ).expect(200);
          expect(search.body.data).toEqual([]);
        } finally {
          await TestUtils.setOwnerAccountState(data, {
            isActive: true,
            deletedAt: null,
          });
        }

        // Compte rétabli : la résidence redevient visible.
        await http().get(`/api/public/v1/residences/${visibleId}`).expect(200);
      },
    );
  });

  describe('Disponibilité réelle', () => {
    it('réservation en attente de paiement : bloque 15 minutes ; réservation confirmée : bloque', async () => {
      const checkIn = day(40);
      const checkOut = day(43);
      const availability = () =>
        partner(
          `/api/partner/v1/residences/${visibleId}/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
        ).expect(200);
      const searchAvailable = async () =>
        (
          await partner(
            `/api/partner/v1/residences?city=${city}&checkIn=${checkIn}&checkOut=${checkOut}`,
          ).expect(200)
        ).body.data;

      expect((await availability()).body.data).toEqual({
        residenceId: visibleId,
        checkIn,
        checkOut,
        available: true,
        nights: 3,
        pricePerNight: { amount: 30000, currency: 'XOF' },
        estimatedTotal: { amount: 90000, currency: 'XOF' },
        url: `https://dodovroum.com/r/${visibleId}`,
      });
      expect(await searchAvailable()).toHaveLength(1);

      // Réservation créée par le parcours réel de l'application.
      const clientToken = await TestUtils.getAuthToken(
        app,
        data.clientUser.email,
      );
      const booking = await http()
        .post('/api/bookings')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          residenceId: visibleId,
          startDate: TestUtils.dateInDays(41),
          endDate: TestUtils.dateInDays(42),
        })
        .expect(201);

      expect((await availability()).body.data.available).toBe(false);
      expect(await searchAvailable()).toEqual([]);

      // Paiement en attente depuis 20 minutes : au-delà de la fenêtre de 15 minutes.
      await TestUtils.setBookingState(data, booking.body.id, {
        status: 'AWAITING_PAYMENT',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      expect((await availability()).body.data.available).toBe(true);

      await TestUtils.setBookingState(data, booking.body.id, {
        status: 'CONFIRMED',
      });
      expect((await availability()).body.data.available).toBe(false);
    });

    it('dates bloquées par le propriétaire', async () => {
      await TestUtils.blockResidenceDates(
        data,
        visibleId,
        new Date(TestUtils.dateInDays(61)),
        new Date(TestUtils.dateInDays(63)),
      );

      const res = await partner(
        `/api/partner/v1/residences/${visibleId}/availability?checkIn=${day(60)}&checkOut=${day(62)}`,
      ).expect(200);
      expect(res.body.data.available).toBe(false);
    });

    it('résidence non publiable : 404', async () => {
      await partner(
        `/api/partner/v1/residences/${suspendedId}/availability?checkIn=${day(40)}&checkOut=${day(41)}`,
      ).expect(404);
    });
  });

  describe('Quotas', () => {
    // En dernier : épuise le quota de disponibilité du partenaire de test (20 requêtes par minute).
    it('disponibilité : 429 RATE_LIMITED avec Retry-After au-delà du quota', async () => {
      const url = `/api/partner/v1/residences/${visibleId}/availability?checkIn=${day(80)}&checkOut=${day(81)}`;
      let limited: request.Response | undefined;
      for (let i = 0; i < 21 && !limited; i++) {
        const res = await partner(url);
        if (res.status === 429) limited = res;
        else expect(res.status).toBe(200);
      }

      expect(limited).toBeDefined();
      expect(limited!.body.error.code).toBe('RATE_LIMITED');
      expect(limited!.headers['retry-after']).toBeDefined();
      expect(limited!.headers['cache-control']).toBe('no-store');
    });
  });
});
