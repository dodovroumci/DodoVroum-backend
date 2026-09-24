/**
 * @file src/payments/dto/create-payment.dto.ts
 * @description DTO de création de transaction financière avec typage Swagger sécurisé.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/**
 * @class CreatePaymentDto
 * @description Schéma de validation pour l'enregistrement d'un paiement.
 *
 * `status`, `paidAt`, `transactionId`, `webhookEventId`, `refundRequiredAt` et
 * `paymentOption` sont volontairement absents : un Payment est toujours créé
 * PENDING et le ValidationPipe global (forbidNonWhitelisted) rejette ces champs.
 */
export class CreatePaymentDto {
  @ApiProperty({ 
    example: 500.00, 
    description: 'Montant de la transaction' 
  })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ 
    example: 'EUR', 
    required: false, 
    default: 'EUR',
    description: 'Devise de la transaction'
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ 
    enum: PaymentMethod, 
    enumName: 'PaymentMethod', // ✅ Correction Swagger
    example: PaymentMethod.CARD,
    description: 'Moyen de paiement utilisé'
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ 
    example: 'booking-id-123',
    description: 'ID de la réservation associée'
  })
  @IsString()
  bookingId: string;
}
