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

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnerStats(ownerId: string): Promise<OwnerStatsDto> {
    const [totalResidences, totalVehicles, totalOffers, totalBookings, paymentsSum] =
      await Promise.all([
        this.prisma.residence.count({ where: { ownerId, isActive: true } }),
        this.prisma.vehicle.count({ where: { ownerId, isActive: true } }),
        this.prisma.offer.count({ where: { ownerId, isActive: true } }),
        this.prisma.booking.count({ where: ownerBookingScope(ownerId) }),
        this.prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            booking: ownerBookingScope(ownerId),
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
    };
  }
}
