import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminStatsDto } from './dto/admin-stats.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtenir les statistiques globales de la plateforme
   */
  async getStats(): Promise<AdminStatsDto> {
    const [
      totalUsers,
      totalResidences,
      totalVehicles,
      totalOffers,
      totalBookings,
      totalPayments,
      pendingBookings,
      pendingIdentityVerifications,
      activeUsers,
      totalAdmins,
      totalProprietaires,
      paymentsData,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.residence.count({ where: { isActive: true } }),
      this.prisma.vehicle.count({ where: { isActive: true } }),
      this.prisma.offer.count({ where: { isActive: true } }),
      this.prisma.booking.count(),
      this.prisma.payment.count(),
      this.prisma.booking.count({
        where: {
          status: {
            in: ['PENDING', 'CONFIRMEE', 'CHECKIN_CLIENT', 'CHECKIN_PROPRIO', 'EN_COURS_SEJOUR'],
          },
        },
      }),
      this.prisma.identityVerification.count({
        where: { verificationStatus: 'PENDING' },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({ where: { role: 'PROPRIETAIRE' } }),
      this.prisma.payment.findMany({
        where: { status: 'COMPLETED' },
        select: { amount: true },
      }),
    ]);

    // Calculer le revenu total
    const totalRevenue = paymentsData.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return {
      totalUsers,
      totalResidences,
      totalVehicles,
      totalOffers,
      totalBookings,
      totalPayments,
      totalRevenue,
      pendingBookings,
      pendingIdentityVerifications,
      activeUsers,
      totalAdmins,
      totalProprietaires,
    };
  }

  /**
   * Obtenir les réservations récentes
   */
  async getRecentBookings(limit: number = 10) {
    return this.prisma.booking.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        residence: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
          },
        },
        offer: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
            method: true,
          },
        },
      },
    });
  }
}

