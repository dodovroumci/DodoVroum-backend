/**
 * @file src/bookings/dto/create-booking.dto.ts
 * @description DTO de création de réservation corrigé pour Swagger.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
  ValidateIf
} from 'class-validator';
import { BookingStatus, PaymentMethod } from '@prisma/client';

/**
 * @enum BookingPaymentOption
 * @description Définit explicitement les options de paiement pour Swagger et Validation.
 */
export enum BookingPaymentOption {
  DOWN_PAYMENT = 'DOWN_PAYMENT',
  FULL_PAYMENT = 'FULL_PAYMENT',
}

export class CreateBookingDto {
  @ApiProperty({ example: '2024-06-01T00:00:00Z', description: 'Date de début' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-06-07T23:59:59Z', description: 'Date de fin' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 500.00, description: 'Montant total calculé' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @ApiPropertyOptional({ example: 'Notes pour le propriétaire' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'residence-id-123' })
  @IsOptional()
  @IsString()
  residenceId?: string;

  @ApiPropertyOptional({ example: 'vehicle-id-456' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({ example: 'offer-id-789' })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    enumName: 'BookingStatus',
    example: BookingStatus.CONFIRMED,
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ example: '2024-06-01T14:00:00Z' })
  @IsOptional()
  @IsDateString()
  keyRetrievedAt?: string;

  @ApiPropertyOptional({ example: '2024-06-01T14:00:00Z' })
  @IsOptional()
  @IsDateString()
  ownerConfirmedAt?: string;

  @ApiPropertyOptional({ example: '2024-06-07T11:00:00Z' })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @ApiPropertyOptional({
    enum: BookingPaymentOption,
    enumName: 'BookingPaymentOption',
    default: BookingPaymentOption.FULL_PAYMENT
  })
  @IsOptional()
  @IsEnum(BookingPaymentOption)
  paymentOption?: BookingPaymentOption = BookingPaymentOption.FULL_PAYMENT;

  @ApiPropertyOptional({
    example: 150,
    description: 'Montant de l’acompte si paymentOption est DOWN_PAYMENT'
  })
  @ValidateIf((o) => o.paymentOption === BookingPaymentOption.DOWN_PAYMENT)
  @IsNumber()
  @Min(0)
  @IsOptional()
  downPaymentAmount?: number;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    default: PaymentMethod.CARD
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.CARD;
}
