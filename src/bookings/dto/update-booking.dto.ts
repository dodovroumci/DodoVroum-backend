import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';

// Lifecycle fields controlled by dedicated endpoints only:
//   status        → /approve, /cancel, /confirm, /confirm-key-retrieval, /confirm-checkout
//   keyRetrievedAt / ownerConfirmedAt / checkOutAt → set internally by those endpoints
export class UpdateBookingDto extends PartialType(
  OmitType(CreateBookingDto, [
    'status',
    'keyRetrievedAt',
    'ownerConfirmedAt',
    'checkOutAt',
  ] as const),
) {}
