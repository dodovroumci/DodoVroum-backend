import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BookingCleanupService {
  private readonly logger = new Logger(BookingCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredBookings(): Promise<void> {
    this.logger.log('🧹 Scan des réservations expirées en cours...');

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    try {
      const expired = await this.prisma.booking.updateMany({
        where: {
          status: BookingStatus.AWAITING_PAYMENT,
          createdAt: { lt: fiveMinutesAgo },
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
      this.logger.error('❌ Erreur lors du nettoyage des réservations :', error.message);
    }
  }
}
