import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

/**
 * @class BookingsProcessor
 * @description Gère l'expiration automatique des réservations non approuvées.
 */
@Injectable()
export class BookingsProcessor {
  private readonly logger = new Logger(BookingsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoExpiration(): Promise<void> {
    const expirationLimit = new Date();
    expirationLimit.setHours(expirationLimit.getHours() - 48);

    try {
      const result = await this.prisma.booking.updateMany({
        where: {
          status: { in: [BookingStatus.PENDING, BookingStatus.AWAITING_PAYMENT] },
          createdAt: { lte: expirationLimit },
          ownerConfirmedAt: null,
        },
        data: { 
          status: BookingStatus.CANCELLED 
        },
      });

      if (result.count > 0) {
        this.logger.log(`[AUTO-EXPIRATION] ${result.count} réservations annulées.`);
      }
    } catch (error) {
      this.logger.error(`[CRON_ERROR] ${error.message}`);
    }
  }
}
