import { AdminService } from '../admin/admin.service';
import { BookingsService } from '../bookings/bookings.service';
import { StatsService } from './stats.service';

/**
 * Contrat API des revenus : `finance` ajouté à GET /stats et GET /admin/stats
 * (anciens champs inchangés) et détail par réservation réservé au propriétaire
 * et à l'admin, jamais au client.
 */
/** Acompte payé, clés remises le 1er octobre : réalisée. */
const confirmedPaid30 = {
  totalPrice: 100000,
  status: 'EN_COURS_SEJOUR',
  ownerConfirmedAt: new Date('2026-10-01T10:00:00Z'),
  payments: [{ amount: 30000, status: 'COMPLETED', refundRequiredAt: null }],
};
/** Payée, en attente du propriétaire : en attente. */
const paidWaitingOwner = {
  totalPrice: 50000,
  status: 'PAID',
  ownerConfirmedAt: null,
  payments: [{ amount: 50000, status: 'COMPLETED', refundRequiredAt: null }],
};
const NOW = new Date('2026-10-15T12:00:00Z');

describe('Revenus — contrat API', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('GET /stats : finance réalisé / mois / en attente, anciens champs conservés', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      residence: { count },
      vehicle: { count },
      offer: { count },
      booking: { count, findMany: jest.fn().mockResolvedValue([confirmedPaid30, paidWaitingOwner]) },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 80000 } }) },
    };

    const stats = await new StatsService(prisma).getOwnerStats('owner-1');

    expect(stats.finance).toEqual({
      owner: { realized: 90000, realizedMonth: 90000, pending: 45000 },
      platform: {
        realized: { bookingValue: 100000, commission: 10000 },
        realizedMonth: { bookingValue: 100000, commission: 10000 },
      },
    });
    // Compatibilité : totalRevenue / monthRevenue gardent leur sens (encaissé en ligne).
    expect(stats).toMatchObject({ totalRevenue: 80000, monthRevenue: 80000 });
    expect(Object.keys(stats).sort()).toEqual(
      ['finance', 'monthRevenue', 'totalBookings', 'totalOffers', 'totalResidences', 'totalRevenue', 'totalVehicles'],
    );
  });

  it('GET /admin/stats : volume et commission DodoVroum à la confirmation, anciens champs conservés', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      user: { count },
      residence: { count },
      vehicle: { count },
      offer: { count },
      booking: { count, findMany: jest.fn().mockResolvedValue([confirmedPaid30, paidWaitingOwner]) },
      payment: { count, findMany: jest.fn().mockResolvedValue([{ amount: 30000 }, { amount: 50000 }]) },
      identityVerification: { count },
    };

    const stats = await new AdminService(prisma).getStats();

    // DodoVroum : seule la réservation confirmée compte (la réservation payée non confirmée non).
    expect(stats.finance.platform.realized).toEqual({ bookingValue: 100000, commission: 10000 });
    expect(stats.totalRevenue).toBe(80000);
  });

  describe('détail financier par réservation', () => {
    const raw = {
      ...confirmedPaid30,
      id: 'bk-1',
      userId: 'client-1',
      startDate: new Date('2026-09-28'),
      endDate: new Date('2026-09-30'),
      createdAt: new Date('2026-09-01'),
      keyRetrievedAt: null,
      checkOutAt: null,
      user: { id: 'client-1', firstName: 'Awa', lastName: 'T', phone: null, email: 'a@test.ci' },
      residence: { id: 'res-1', title: 'Villa', ownerId: 'owner-1', images: '[]', owner: null },
      vehicle: null,
      offer: null,
    };
    const build = () =>
      new BookingsService(
        {
          booking: {
            findMany: jest.fn().mockResolvedValue([raw]),
            findUnique: jest.fn().mockResolvedValue(raw),
            findFirst: jest.fn().mockResolvedValue({ id: 'bk-1' }),
          },
        } as any,
        {} as any,
        {} as any,
        {} as any,
      );
    const expected = {
      bookingValue: 100000,
      commission: 10000,
      ownerRevenue: 90000,
      onlinePaid: 30000,
      remainingOnSite: 70000,
      ownerState: 'REALIZED',
      ownerRealizedAt: new Date('2026-10-01T10:00:00Z'),
      platformState: 'REALIZED',
      platformRealizedAt: new Date('2026-10-01T10:00:00Z'),
    };

    it('propriétaire (my-properties-bookings) et admin (GET /bookings) : présent', async () => {
      const [owner] = await build().findByOwner('owner-1');
      const [admin] = await build().findAll(true);
      expect(owner.finance).toEqual(expected);
      expect(admin.finance).toEqual(expected);
    });

    it('client (liste, détail) et GET /reservations : jamais présent ; champs client inchangés', async () => {
      const service = build();
      const [listed] = await service.findByUser('client-1');
      const detail = await service.findOne('bk-1', 'client-1', 'CLIENT');
      const [unscoped] = await service.findAll();

      expect(listed).not.toHaveProperty('finance');
      expect(detail).not.toHaveProperty('finance');
      expect(unscoped).not.toHaveProperty('finance');
      expect(detail).toMatchObject({ totalPrice: 100000, totalPaid: 30000, remainingBalance: 70000 });
    });

    it('détail consulté par le propriétaire du bien : présent', async () => {
      const detail = await build().findOne('bk-1', 'owner-1', 'PROPRIETAIRE');
      expect(detail.finance).toEqual(expected);
    });
  });
});
