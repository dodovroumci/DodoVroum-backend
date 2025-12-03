import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, Min, ValidateIf } from 'class-validator';

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
  nombre_personnes?: number; // Ignoré mais accepté pour éviter l'erreur
}

