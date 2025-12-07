import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, Min, ValidateIf, IsIn, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/**
 * DTO pour créer une réservation avec des noms de propriétés en français
 * Compatible avec le frontend qui envoie residence_id, date_debut, date_fin, etc.
 * Accepte les deux formats (français et anglais) pour la compatibilité
 */
export class CreateReservationDto {
  // Format anglais (prioritaire)
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

  // Identifiant de "package" (pour compatibilité mobile) - ignoré ou mappé côté service si nécessaire
  @ApiProperty({ example: 'package-id-123', required: false, description: 'Identifiant de package (compatibilité frontend)' })
  @IsOptional()
  @IsString()
  packageId?: string;

  @ApiProperty({ example: '2024-06-01T00:00:00Z', required: false })
  @ValidateIf((o) => !o.date_debut)
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2024-06-07T23:59:59Z', required: false })
  @ValidateIf((o) => !o.date_fin)
  @IsDateString()
  endDate?: string;

  @ApiProperty({ example: 500.00, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @ApiProperty({ example: 'Notes spéciales pour la réservation', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 'DOWN_PAYMENT', required: false, enum: ['DOWN_PAYMENT', 'FULL_PAYMENT'] })
  @IsOptional()
  @IsIn(['DOWN_PAYMENT', 'FULL_PAYMENT'])
  paymentOption?: 'DOWN_PAYMENT' | 'FULL_PAYMENT';

  @ApiProperty({ example: 150, required: false, description: 'Montant payé lors de la réservation si acompte' })
  @ValidateIf((o) => (o.paymentOption || o.option_paiement || 'FULL_PAYMENT') === 'DOWN_PAYMENT')
  @IsNumber()
  @Min(0)
  downPaymentAmount?: number;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // Format français (accepté en alternative)
  @ApiProperty({ example: 'residence-id-123', required: false, description: 'Format français (alternative)' })
  @IsOptional()
  @IsString()
  residence_id?: string;

  @ApiProperty({ example: 'vehicle-id-456', required: false, description: 'Format français (alternative)' })
  @IsOptional()
  @IsString()
  vehicle_id?: string;

  @ApiProperty({ example: 'vehicle-id-456', required: false, description: 'Format français - voiture (alternative)' })
  @IsOptional()
  @IsString()
  voiture_id?: string;

  @ApiProperty({ example: 'offer-id-789', required: false, description: 'Format français (alternative)' })
  @IsOptional()
  @IsString()
  offer_id?: string;

  // Format français pour l'identifiant de package - accepté pour éviter l'erreur de validation
  @ApiProperty({ example: 'package-id-123', required: false, description: 'Identifiant de package (format français, compatibilité frontend)' })
  @IsOptional()
  @IsString()
  package_id?: string;

  @ApiProperty({ example: '2024-06-01T00:00:00Z', required: false, description: 'Format français (alternative)' })
  @ValidateIf((o) => !o.startDate)
  @IsDateString()
  date_debut?: string;

  @ApiProperty({ example: '2024-06-07T23:59:59Z', required: false, description: 'Format français (alternative)' })
  @ValidateIf((o) => !o.endDate)
  @IsDateString()
  date_fin?: string;

  @ApiProperty({ example: 500.00, required: false, description: 'Format français (alternative)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  prix_total?: number;

  @ApiProperty({ example: 2, required: false, description: 'Nombre de personnes (ignoré mais accepté)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  nombre_personnes?: number; // Ignoré mais accepté pour éviter l'erreur

  @ApiProperty({ example: 'DOWN_PAYMENT', required: false, description: 'Option de paiement (français)' })
  @IsOptional()
  @IsIn(['DOWN_PAYMENT', 'FULL_PAYMENT'])
  option_paiement?: 'DOWN_PAYMENT' | 'FULL_PAYMENT';

  @ApiProperty({ example: 150, required: false, description: 'Montant de l’acompte (français)' })
  @ValidateIf((o) => (o.paymentOption || o.option_paiement || 'FULL_PAYMENT') === 'DOWN_PAYMENT')
  @IsNumber()
  @Min(0)
  montant_acompte?: number;

  @ApiProperty({ example: 'CARD', required: false, description: 'Méthode de paiement (français)' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  methode_paiement?: PaymentMethod;
}

