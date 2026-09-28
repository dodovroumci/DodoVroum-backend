import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

/** Délai après la date de fin avant de terminer automatiquement un séjour. */
export const AUTO_CHECKOUT_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * @class BookingsProcessor
 * @description Expiration automatique des réservations non approuvées et fin
 * automatique des séjours non clôturés.
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
          status: BookingStatus.EXPIRED 
        },
      });

      if (result.count > 0) {
        this.logger.log(`[AUTO-EXPIRATION] ${result.count} réservations passées en EXPIRED.`);
      }
    } catch (error) {
      this.logger.error(`[CRON_ERROR] ${error.message}`);
    }
  }

  /**
   * Fin automatique : un séjour en cours dont la date de fin est dépassée depuis
   * 24 h passe en COMPLETED (même effet qu'un check-out confirmé). Les dates de
   * remise des clés (keyRetrievedAt / ownerConfirmedAt) ne sont pas modifiées.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoCheckout(): Promise<void> {
    const now = new Date();
    const endedBefore = new Date(now.getTime() - AUTO_CHECKOUT_DELAY_MS);

    try {
      const result = await this.prisma.booking.updateMany({
        where: {
          status: { in: [BookingStatus.EN_COURS_SEJOUR, BookingStatus.ONGOING] },
          endDate: { lte: endedBefore },
          deletedAt: null,
        },
        data: {
          status: BookingStatus.COMPLETED,
          checkOutAt: now,
        },
      });

      if (result.count > 0) {
        this.logger.log(`[AUTO-CHECKOUT] ${result.count} séjours terminés automatiquement (fin + 24 h).`);
      }
    } catch (error) {
      this.logger.error(`[CRON_ERROR] ${error.message}`);
    }
  }
}
