import { BookingsService } from '../bookings/bookings.service';
import { StatsService } from '../stats/stats.service';
import { AdminService } from '../admin/admin.service';

/**
 * Un paiement COMPLETED marqué `refundRequiredAt` est de l'argent reçu mais à
 * rembourser : il ne compte ni dans le montant payé d'une réservation ni dans
 * les revenus propriétaire / admin.
 */
describe('Paiements à rembourser exclus des montants payés et des revenus', () => {
  it('totalPaid / paymentStatus d\'une réservation ignorent les paiements à rembourser', async () => {
    const prisma: any = {
      booking: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bk-1',
            userId: 'client-1',
            status: 'EXPIRED',
            totalPrice: 100000,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-09-05'),
            createdAt: new Date('2026-08-01'),
            ownerConfirmedAt: null,
            keyRetrievedAt: null,
            checkOutAt: null,
            payments: [
              { id: 'p-late', status: 'COMPLETED', amount: 100000, refundRequiredAt: new Date() },
              { id: 'p-old', status: 'FAILED', amount: 100000, refundRequiredAt: null },
            ],
            user: { id: 'client-1', firstName: 'Awa', lastName: 'T', phone: null, email: 'a@test.ci' },
            residence: null,
            vehicle: null,
            offer: null,
          },
        ]),
      },
    };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any);

    const [res] = await service.findByUser('client-1');

    expect(res.totalPaid).toBe(0);
    expect(res.paymentStatus).toBe('UNPAID');
  });

  it('revenu propriétaire : filtre refundRequiredAt null', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { amount: 0 } });
    const count = jest.fn().mockResolvedValue(0);
    const prisma: any = {
      residence: { count },
      vehicle: { count },
      offer: { count },
      booking: { count },
      payment: { aggregate },
    };

    await new StatsService(prisma).getOwnerStats('owner-1');

    expect(aggregate.mock.calls[0][0].where).toMatchObject({ status: 'COMPLETED', refundRequiredAt: null });
  });

  it('revenu admin : filtre refundRequiredAt null', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma: any = {
      user: { count },
      residence: { count },
      vehicle: { count },
      offer: { count },
      booking: { count },
      payment: { count, findMany },
      identityVerification: { count },
    };

    await new AdminService(prisma).getStats();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'COMPLETED', refundRequiredAt: null } }),
    );
  });
});
