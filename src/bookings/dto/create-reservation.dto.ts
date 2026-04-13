/**
 * @file src/bookings/dto/create-reservation.dto.ts
 * @description DTO de réservation hybride corrigé pour correspondre au controller.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  IsDateString,
  ValidateIf
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export enum ReservationPaymentOption {
  DOWN_PAYMENT = 'DOWN_PAYMENT',
  FULL_PAYMENT = 'FULL_PAYMENT',
}

export class CreateReservationDto {
  // --- IDENTIFIANTS ---
  @ApiPropertyOptional() @IsOptional() @IsString()
  residenceId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  vehicleId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  offerId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  packageId?: string; // Ajouté pour le controller

  // --- COMPATIBILITÉ FR ---
  @IsOptional() @IsString() residence_id?: string;
  @IsOptional() @IsString() vehicle_id?: string;
  @IsOptional() @IsString() voiture_id?: string;
  @IsOptional() @IsString() offer_id?: string;
  @IsOptional() @IsString() package_id?: string;

  // --- DATES ---
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() date_debut?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() date_fin?: string;

  // --- PRIX ET PAIEMENT (PROPRIÉTÉS MANQUANTES CORRIGÉES) ---
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  totalPrice?: number; // Attendu par le controller

  @IsOptional() @IsNumber() @Min(0)
  prix_total?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  nombre_personnes?: number;

  @ApiPropertyOptional({ enum: ReservationPaymentOption })
  @IsOptional() @IsEnum(ReservationPaymentOption)
  paymentOption?: ReservationPaymentOption = ReservationPaymentOption.FULL_PAYMENT; // Attendu

  @IsOptional() @IsEnum(ReservationPaymentOption)
  option_paiement?: ReservationPaymentOption;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  downPaymentAmount?: number; // Attendu

  @IsOptional() @IsNumber() @Min(0)
  montant_acompte?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional() @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.CARD; // Attendu

  @IsOptional() @IsEnum(PaymentMethod)
  methode_paiement?: PaymentMethod;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string; // Attendu
}
