import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { ReservationsController } from './reservations.controller';
import { BookingsService } from './bookings.service';
import { BookingValidationService } from './services/booking-validation.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController, ReservationsController],
  providers: [BookingsService, BookingValidationService],
})
export class BookingsModule {}
