/**
 * @file booking-cleanup.service.ts
 * @stack Next.js 14 / NestJS / Prisma
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BookingCleanupService {
  private readonly logger = new Logger(BookingCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @description Scan toutes les minutes pour expirer les réservations non payées après 15 min.
   * @rule Golden Rule: Toujours vérifier le statut AWAITING_PAYMENT uniquement.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredBookings(): Promise<void> {
    this.logger.log('🧹 Scan des réservations expirées (Marge: 15min) en cours...');

    const expirationThreshold = new Date(Date.now() - 15 * 60 * 1000);

    try {
      const expired = await this.prisma.booking.updateMany({
        where: {
          status: BookingStatus.AWAITING_PAYMENT,
          createdAt: { lt: expirationThreshold },
        },
        data: {
          status: BookingStatus.EXPIRED,
        },
      });

      if (expired.count > 0) {
        this.logger.warn(
          `✅ Nettoyage terminé : ${expired.count} réservations passées en EXPIRED.`,
        );
      }
    } catch (error) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error('❌ Erreur lors du nettoyage des réservations', stack);
    }
  }
}
