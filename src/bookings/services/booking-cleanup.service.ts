import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BookingCleanupService {
  private readonly logger = new Logger(BookingCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredBookings(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const expired = await this.prisma.booking.updateMany({
      where: {
        status: BookingStatus.PENDING,
        createdAt: { lt: fiveMinutesAgo },
      },
      data: {
        status: BookingStatus.EXPIRED,
      },
    });

    if (expired.count > 0) {
      this.logger.log(`🧹 ${expired.count} réservation(s) expirée(s) marquée(s) EXPIRED.`);
    }
  }
}
