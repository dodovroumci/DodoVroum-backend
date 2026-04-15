import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { ReservationsController } from './reservations.controller';
import { BookingsService } from './bookings.service';
import { BookingValidationService } from './services/booking-validation.service';
import { BookingCleanupService } from './services/booking-cleanup.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsProcessor } from './bookings.processor'; // ✅ Import du processeur de Cron Jobs

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController, ReservationsController],
  providers: [
    BookingsService, 
    BookingValidationService,
    BookingCleanupService,
    BookingsProcessor // ✅ Enregistrement du processeur pour activer le scan auto des expirations
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
