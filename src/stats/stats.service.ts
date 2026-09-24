import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OwnerStatsDto } from './dto/owner-stats.dto';

const ownerBookingScope = (ownerId: string) => ({
  OR: [
    { residence: { ownerId } },
    { vehicle: { ownerId } },
    { offer: { ownerId } },
  ],
});

/** Argent réellement encaissé : paiement COMPLETED et non marqué à rembourser. */
const collectedPayments = (ownerId: string) => ({
  status: 'COMPLETED' as const,
  refundRequiredAt: null, // argent reçu mais à rembourser : pas un revenu
  booking: ownerBookingScope(ownerId),
});

/** Premier jour du mois courant, 00:00 UTC (Abidjan = UTC toute l'année). */
const startOfCurrentMonthUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnerStats(ownerId: string): Promise<OwnerStatsDto> {
    const now = new Date();
    const [totalResidences, totalVehicles, totalOffers, totalBookings, paymentsSum, monthSum] =
      await Promise.all([
        this.prisma.residence.count({ where: { ownerId, isActive: true } }),
        this.prisma.vehicle.count({ where: { ownerId, isActive: true } }),
        this.prisma.offer.count({ where: { ownerId, isActive: true } }),
        this.prisma.booking.count({ where: ownerBookingScope(ownerId) }),
        this.prisma.payment.aggregate({
          where: collectedPayments(ownerId),
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            ...collectedPayments(ownerId),
            paidAt: { gte: startOfCurrentMonthUtc(now), lte: now },
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      totalResidences,
      totalVehicles,
      totalOffers,
      totalBookings,
      totalRevenue: Number(paymentsSum._sum.amount ?? 0),
      monthRevenue: Number(monthSum._sum.amount ?? 0),
    };
  }
}
