import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, Min, ValidateIf, IsIn } from 'class-validator';
import { BookingStatus, PaymentMethod } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ example: '2024-06-01T00:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-06-07T23:59:59Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 500.00 })
  @IsNumber()
  @Min(0)
  totalPrice: number;

  @ApiProperty({ example: 'Notes spéciales pour la réservation', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 'residence-id-123', required: false })
  @IsOptional()
  @IsString()
  residenceId?: string;

  @ApiProperty({ example: 'vehicle-id-456', required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ example: 'offer-id-789', required: false })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED, required: false })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiProperty({ example: '2024-06-01T14:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  keyRetrievedAt?: string;

  @ApiProperty({ example: '2024-06-01T14:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  ownerConfirmedAt?: string;

  @ApiProperty({ example: '2024-06-07T11:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @ApiProperty({ enum: ['DOWN_PAYMENT', 'FULL_PAYMENT'], required: false, default: 'FULL_PAYMENT' })
  @IsOptional()
  @IsIn(['DOWN_PAYMENT', 'FULL_PAYMENT'])
  paymentOption?: 'DOWN_PAYMENT' | 'FULL_PAYMENT';

  @ApiProperty({ example: 150, required: false, description: 'Montant payé lors de la réservation en cas d’acompte' })
  @ValidateIf((o) => (o.paymentOption || 'FULL_PAYMENT') === 'DOWN_PAYMENT')
  @IsNumber()
  @Min(0)
  downPaymentAmount?: number;

  @ApiProperty({ enum: PaymentMethod, required: false, default: PaymentMethod.CARD })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
