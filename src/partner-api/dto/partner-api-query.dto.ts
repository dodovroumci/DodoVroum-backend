import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property doit être au format YYYY-MM-DD';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const PARTNER_RESIDENCE_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
] as const;
export type PartnerResidenceSort = (typeof PARTNER_RESIDENCE_SORTS)[number];

export const PARTNER_DEFAULT_LIMIT = 20;
export const PARTNER_MAX_LIMIT = 50;
export const PARTNER_MAX_PAGE = 1000;
const MAX_PRICE = 100_000_000;

/** GET /api/partner/v1/residences — tout paramètre non listé est refusé (400). */
export class PartnerResidencesQueryDto {
  @ApiPropertyOptional({
    description: 'Ville (égalité, insensible à la casse)',
    example: 'Assinie',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  city?: string;

  @ApiPropertyOptional({
    description: 'Recherche dans le titre et la ville (jamais l’adresse)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Type de résidence (texte libre, correspondance partielle)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  typeResidence?: string;

  @ApiPropertyOptional({ description: 'Prix minimum par nuit (XOF)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Prix maximum par nuit (XOF)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Nombre de voyageurs (capacité minimale)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests?: number;

  @ApiPropertyOptional({ description: 'Nombre minimal de chambres' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  bedrooms?: number;

  @ApiPropertyOptional({
    description:
      'Arrivée (YYYY-MM-DD), avec checkOut : résidences disponibles seulement',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  checkIn?: string;

  @ApiPropertyOptional({ description: 'Départ (YYYY-MM-DD, exclu)' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  checkOut?: string;

  @ApiPropertyOptional({ enum: PARTNER_RESIDENCE_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PARTNER_RESIDENCE_SORTS)
  sort?: PartnerResidenceSort;

  @ApiPropertyOptional({ minimum: 1, maximum: PARTNER_MAX_PAGE, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PARTNER_MAX_PAGE)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PARTNER_MAX_LIMIT,
    default: PARTNER_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PARTNER_MAX_LIMIT)
  limit?: number;
}

/** GET /api/partner/v1/residences/:id/availability */
export class PartnerAvailabilityQueryDto {
  @ApiProperty({ example: '2026-12-20' })
  @IsString()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  checkIn!: string;

  @ApiProperty({ example: '2026-12-23', description: 'Jour de départ, exclu' })
  @IsString()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  checkOut!: string;
}
