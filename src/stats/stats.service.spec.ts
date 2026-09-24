import { StatsService } from './stats.service';

/**
 * Revenus propriétaire = argent réellement encaissé : paiements COMPLETED non
 * marqués à rembourser, sur les biens du propriétaire. Le revenu du mois se
 * base sur la date d'encaissement (paidAt), jamais sur totalPrice.
 *
 * `payment.aggregate` est simulé en appliquant les filtres Prisma utilisés par
 * le service (status, refundRequiredAt, paidAt, périmètre propriétaire) ; la
 * forme exacte des requêtes est vérifiée séparément.
 */
type Payment = {
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  refundRequiredAt: Date | null;
  paidAt: Date | null;
  booking: { residenceOwnerId?: string; vehicleOwnerId?: string; offerOwnerId?: string };
};

const NOW = new Date('2026-09-24T12:00:00Z');

function matchesOwner(p: Payment, scope: any): boolean {
  return scope.OR.some(
    (c: any) =>
      (c.residence && p.booking.residenceOwnerId === c.residence.ownerId) ||
      (c.vehicle && p.booking.vehicleOwnerId === c.vehicle.ownerId) ||
      (c.offer && p.booking.offerOwnerId === c.offer.ownerId),
  );
}

function fakePrisma(payments: Payment[]) {
  const aggregate = jest.fn(async ({ where }: any) => {
    const rows = payments.filter(
      (p) =>
        p.status === where.status &&
        (where.refundRequiredAt === null ? p.refundRequiredAt === null : true) &&
        matchesOwner(p, where.booking) &&
        (!where.paidAt ||
          (p.paidAt !== null && p.paidAt >= where.paidAt.gte && p.paidAt <= where.paidAt.lte)),
    );
    return { _sum: { amount: rows.length ? rows.reduce((s, p) => s + p.amount, 0) : null } };
  });
  const count = jest.fn().mockResolvedValue(0);
  return {
    aggregate,
    prisma: {
      residence: { count },
      vehicle: { count },
      offer: { count },
      booking: { count },
      payment: { aggregate },
    } as any,
  };
}

const pay = (overrides: Partial<Payment>): Payment => ({
  amount: 50000,
  status: 'COMPLETED',
  refundRequiredAt: null,
  paidAt: new Date('2026-09-10T09:00:00Z'),
  booking: { residenceOwnerId: 'owner-1' },
  ...overrides,
});

async function revenue(payments: Payment[], ownerId = 'owner-1') {
  const { prisma } = fakePrisma(payments);
  const { totalRevenue, monthRevenue } = await new StatsService(prisma).getOwnerStats(ownerId);
  return { totalRevenue, monthRevenue };
}

describe('StatsService — revenus propriétaire (argent encaissé)', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('réservation non payée (aucun paiement) : 0', async () => {
    await expect(revenue([])).resolves.toEqual({ totalRevenue: 0, monthRevenue: 0 });
  });

  it('paiement PENDING : 0', async () => {
    await expect(revenue([pay({ status: 'PENDING', paidAt: null })])).resolves.toEqual({
      totalRevenue: 0,
      monthRevenue: 0,
    });
  });

  it('paiement FAILED : 0', async () => {
    await expect(revenue([pay({ status: 'FAILED', paidAt: null })])).resolves.toEqual({
      totalRevenue: 0,
      monthRevenue: 0,
    });
  });

  it('acompte de 15 000 sur une réservation de 50 000 : 15 000 (pas le solde restant)', async () => {
    await expect(revenue([pay({ amount: 15000 })])).resolves.toEqual({
      totalRevenue: 15000,
      monthRevenue: 15000,
    });
  });

  it('paiement complet de 50 000 : 50 000', async () => {
    await expect(revenue([pay({ amount: 50000 })])).resolves.toEqual({
      totalRevenue: 50000,
      monthRevenue: 50000,
    });
  });

  it('paiement COMPLETED marqué refundRequiredAt : exclu', async () => {
    await expect(revenue([pay({ refundRequiredAt: new Date('2026-09-11T00:00:00Z') })])).resolves.toEqual({
      totalRevenue: 0,
      monthRevenue: 0,
    });
  });

  it('revenu du mois selon paidAt : encaissé en août compte au total, pas au mois', async () => {
    const result = await revenue([
      pay({ amount: 20000, paidAt: new Date('2026-08-31T23:59:59Z') }),
      pay({ amount: 30000, paidAt: new Date('2026-09-01T00:00:00Z') }),
    ]);
    expect(result).toEqual({ totalRevenue: 50000, monthRevenue: 30000 });
  });

  it('requête du mois : du 1er du mois (UTC) jusqu\'à maintenant, mêmes filtres que le total', async () => {
    const { prisma, aggregate } = fakePrisma([]);
    await new StatsService(prisma).getOwnerStats('owner-1');

    const [totalWhere, monthWhere] = aggregate.mock.calls.map(([args]) => args.where);
    expect(totalWhere).toMatchObject({ status: 'COMPLETED', refundRequiredAt: null });
    expect(totalWhere.paidAt).toBeUndefined();
    expect(monthWhere).toMatchObject({
      status: 'COMPLETED',
      refundRequiredAt: null,
      booking: totalWhere.booking,
      paidAt: { gte: new Date('2026-09-01T00:00:00Z'), lte: NOW },
    });
  });

  it('isolation : un propriétaire ne récupère pas les paiements des biens d\'un autre', async () => {
    const payments = [
      pay({ amount: 10000, booking: { residenceOwnerId: 'owner-1' } }),
      pay({ amount: 70000, booking: { residenceOwnerId: 'owner-2' } }),
      pay({ amount: 5000, booking: { vehicleOwnerId: 'owner-2' } }),
      pay({ amount: 2000, booking: { offerOwnerId: 'owner-1' } }),
    ];
    await expect(revenue(payments, 'owner-1')).resolves.toEqual({ totalRevenue: 12000, monthRevenue: 12000 });
    await expect(revenue(payments, 'owner-2')).resolves.toEqual({ totalRevenue: 75000, monthRevenue: 75000 });
  });
});
