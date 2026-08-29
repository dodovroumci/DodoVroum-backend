import { BookingsService } from './bookings.service';

/**
 * Le téléphone du client n'est communiqué au propriétaire qu'une fois la
 * réservation confirmée (ownerConfirmedAt renseigné) et tant qu'elle n'est ni
 * annulée ni expirée. Avant, seul le nom du client est exposé.
 */
describe('BookingsService — exposition du téléphone client dans la réponse réservation', () => {
  let service: BookingsService;
  let prisma: any;

  const buildBooking = (overrides: Record<string, any> = {}) => ({
    id: 'bk-1',
    userId: 'client-1',
    status: 'CONFIRMED',
    totalPrice: 100000,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-05'),
    createdAt: new Date('2026-08-01'),
    ownerConfirmedAt: new Date('2026-08-02'),
    keyRetrievedAt: null,
    checkOutAt: null,
    payments: [],
    user: {
      id: 'client-1',
      firstName: 'Awa',
      lastName: 'Traoré',
      phone: '+2250700000000',
      email: 'awa@test.ci',
    },
    residence: {
      id: 'res-1',
      title: 'Villa Cocody',
      ownerId: 'owner-1',
      images: '[]',
      owner: { id: 'owner-1', firstName: 'Koffi', lastName: 'N', phone: '+2250799999999' },
    },
    vehicle: null,
    offer: null,
    ...overrides,
  });

  beforeEach(() => {
    prisma = { booking: { findMany: jest.fn() } };
    service = new BookingsService(prisma, {} as any, {} as any, {} as any);
  });

  it('expose clientPhone une fois la réservation confirmée par le propriétaire', async () => {
    prisma.booking.findMany.mockResolvedValue([buildBooking()]);

    const [res] = await service.findByOwner('owner-1');

    expect(res.clientName).toBe('Awa Traoré');
    expect(res.clientPhone).toBe('+2250700000000');
  });

  it("masque clientPhone tant que le propriétaire n'a pas confirmé", async () => {
    prisma.booking.findMany.mockResolvedValue([
      buildBooking({ status: 'PENDING', ownerConfirmedAt: null }),
    ]);

    const [res] = await service.findByOwner('owner-1');

    expect(res.clientPhone).toBeNull();
    expect(res.clientName).toBe('Awa Traoré'); // le nom reste visible
  });

  it('masque clientPhone si la réservation confirmée est ensuite annulée', async () => {
    prisma.booking.findMany.mockResolvedValue([buildBooking({ status: 'CANCELLED' })]);

    const [res] = await service.findByOwner('owner-1');

    expect(res.clientPhone).toBeNull();
  });

  it('conserve clientPhone après le séjour (réservation terminée)', async () => {
    prisma.booking.findMany.mockResolvedValue([
      buildBooking({ status: 'COMPLETED', checkOutAt: new Date('2026-09-05') }),
    ]);

    const [res] = await service.findByOwner('owner-1');

    expect(res.clientPhone).toBe('+2250700000000');
  });
});
