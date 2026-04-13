/**
 * @file src/payments/dto/create-payment.dto.ts
 * @description DTO de création de transaction financière avec typage Swagger sécurisé.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { PaymentStatus, PaymentMethod } from '@prisma/client';

/**
 * @class CreatePaymentDto
 * @description Schéma de validation pour l'enregistrement d'un paiement.
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
    enum: PaymentStatus, 
    enumName: 'PaymentStatus', // ✅ Correction Swagger
    example: PaymentStatus.PENDING, 
    required: false,
    description: 'Statut actuel du paiement'
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiProperty({ 
    enum: PaymentMethod, 
    enumName: 'PaymentMethod', // ✅ Correction Swagger
    example: PaymentMethod.CARD,
    description: 'Moyen de paiement utilisé'
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ 
    example: 'txn_123456789', 
    required: false,
    description: 'ID de transaction provenant du fournisseur (Stripe, etc.)'
  })
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ApiProperty({ 
    example: 'booking-id-123',
    description: 'ID de la réservation associée'
  })
  @IsString()
  bookingId: string;
}
