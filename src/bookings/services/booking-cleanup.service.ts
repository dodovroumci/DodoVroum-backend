/**
 * @file booking-cleanup.service.ts
 * @stack NestJS / Prisma / Firebase Admin SDK
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class BookingCleanupService {
  private readonly logger = new Logger(BookingCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * @description Scan toutes les minutes pour expirer les réservations non payées après 15 min.
   * @rule Golden Rule: Toujours vérifier le statut AWAITING_PAYMENT uniquement.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCleanup(): Promise<void> {
    const threshold = new Date(Date.now() - 15 * 60 * 1000);

    const toExpire = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.AWAITING_PAYMENT,
        createdAt: { lt: threshold },
      },
      select: { id: true, userId: true },
    });

    if (toExpire.length === 0) {
      return;
    }

    const bookingIds = toExpire.map((b) => b.id);

    try {
      await this.prisma.booking.updateMany({
        where: {
          id: { in: bookingIds },
          status: BookingStatus.AWAITING_PAYMENT,
        },
        data: { status: BookingStatus.EXPIRED },
      });

      const expiredRows = await this.prisma.booking.findMany({
        where: {
          id: { in: bookingIds },
          status: BookingStatus.EXPIRED,
        },
        select: { userId: true },
      });

      if (expiredRows.length === 0) {
        return;
      }

      this.logger.warn(`🚫 ${expiredRows.length} réservations expirées.`);

      const uniqueUserIds = [...new Set(expiredRows.map((b) => b.userId))];
      void this.sendExpirationNotifications(uniqueUserIds).catch((err) => {
        this.logger.error('Échec envoi des notifications d’expiration', err);
      });
    } catch (error) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error('❌ Échec du cleanup des réservations', stack);
    }
  }

  private async sendExpirationNotifications(userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.notificationsService.sendToUser(userId, {
          title: '⏳ Temps écoulé !',
          body: 'Votre réservation DodoVroum a expiré. Pas de panique, vous pouvez recommencer en un clic.',
          data: {
            type: 'BOOKING_EXPIRED',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
        });
      } catch (e) {
        this.logger.error(`Impossible d'envoyer la notification à l'utilisateur ${userId}`);
      }
    }
  }
}
