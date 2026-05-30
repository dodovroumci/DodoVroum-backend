/**
 * @file src/residences/dto/residences-query.dto.ts
 * @description DTO de filtrage des résidences avec héritage de pagination.
 */

import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * @enum ResidenceStatus
 * @description État de disponibilité d'une résidence.
 */
export enum ResidenceStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
}

export class ResidencesQueryDto extends IntersectionType(PaginationDto) {
  @ApiPropertyOptional({
    example: 'villa',
    description: 'Filtrer par type (ex: villa, appartement, studio)',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    enum: ResidenceStatus,
    enumName: 'ResidenceStatus',
    example: ResidenceStatus.AVAILABLE,
    description: 'Filtrer par statut de disponibilité',
  })
  @IsOptional()
  @IsEnum(ResidenceStatus)
  status?: ResidenceStatus;

  @ApiPropertyOptional({
    example: 'abidjan',
    description: 'Rechercher dans le titre, la ville, l\'adresse ou le pays',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'user123',
    description: 'ID du propriétaire (proprietaireId)',
  })
  @IsOptional()
  @IsString()
  proprietaireId?: string;

  @ApiPropertyOptional({
    example: 'user123',
    description: 'Alias pour proprietaireId (compatibilité frontend)',
  })
  @IsOptional()
  @IsString()
  owner_id?: string;

  @ApiPropertyOptional({
    example: 'villa',
    description: 'Alias pour type (compatibilité dashboard)',
  })
  @IsOptional()
  @IsString()
  typeResidence?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Filtrer par statut actif. true = actives uniquement (défaut), false = inactives uniquement',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  isActive?: boolean;
}
