import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsNumberString } from 'class-validator';
import { VehicleType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * @class VehiclesQueryDto
 * @description Filtres de recherche pour les véhicules. 
 * Nomenclature uniformisée sur 'proprietaireId'.
 */
export class VehiclesQueryDto extends IntersectionType(PaginationDto) {
  @ApiPropertyOptional({
    enum: VehicleType,
    enumName: 'VehicleType',
    description: 'Type de véhicule (ex: CAR, SUV, MOTORCYCLE)',
  })
  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @ApiPropertyOptional({ description: 'ID unique du propriétaire' })
  @IsOptional()
  @IsString()
  proprietaireId?: string; // Nomenclature unique choisie

  @ApiPropertyOptional({ description: 'Prix minimum journalier' })
  @IsOptional()
  @IsNumberString()
  minPrice?: string;

  @ApiPropertyOptional({ description: 'Prix maximum journalier' })
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiPropertyOptional({ description: 'Recherche globale (marque, modèle)' })
  @IsOptional()
  @IsString()
  search?: string;
}
