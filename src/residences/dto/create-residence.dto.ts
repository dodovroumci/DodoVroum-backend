/**
 * @file src/residences/dto/create-residence.dto.ts
 * @description DTO de création de résidence avec typage explicite pour Swagger.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsNumber, 
  IsArray, 
  IsOptional, 
  IsBoolean, 
  Min, 
  IsInt, 
  ValidateIf, 
  ValidateNested 
} from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  @ApiProperty({ example: 5.3600 })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: -4.0083 })
  @IsNumber()
  longitude: number;
}

export class CreateResidenceDto {
  @ApiPropertyOptional({ example: 'Villa de luxe avec piscine' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Villa de luxe', description: 'Alias français pour title' })
  @IsOptional()
  @IsString()
  nom?: string;

  @ApiPropertyOptional({ example: 'Magnifique villa avec vue sur mer...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '123 Rue de la Plage' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '123 Rue de la Plage', description: 'Alias français pour address' })
  @IsOptional()
  @IsString()
  adresse?: string;

  @ApiPropertyOptional({ example: 'Nice' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Nice', description: 'Alias français pour city' })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ example: 'France' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'France', description: 'Alias français pour country' })
  @IsOptional()
  @IsString()
  pays?: string;

  @ApiPropertyOptional({ example: 150.50 })
  @ValidateIf((o) => o.pricePerDay !== undefined || !o.pricePerNight)
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerDay?: number;

  @ApiPropertyOptional({ example: 150.50, description: 'Alias pour pricePerDay' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerNight?: number;

  @ApiPropertyOptional({ example: 150.50, description: 'Alias français pour pricePerDay' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  prixParNuit?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 6, description: 'Alias français pour capacity' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacite?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 3, description: 'Alias français pour bedrooms' })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombreChambres?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 2, description: 'Alias français pour bathrooms' })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombreSallesBain?: number;

  @ApiPropertyOptional({ 
    example: ['WiFi', 'Piscine'], 
    type: [String],
    isArray: true 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ 
    example: ['WiFi', 'Piscine'], 
    description: 'Alias français pour amenities',
    type: [String],
    isArray: true 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commodites?: string[];

  @ApiProperty({ 
    example: ['https://example.com/image1.jpg'],
    type: [String],
    isArray: true 
  })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiPropertyOptional({ example: 'Villa moderne' })
  @IsOptional()
  @IsString()
  typeResidence?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ example: 5.3600 })
  @ValidateIf((o) => !o.location)
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -4.0083 })
  @ValidateIf((o) => !o.location)
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    type: LocationDto,
    description: 'Objet location (alternative aux champs séparés)'
  })
  @ValidateIf((o) => !o.latitude && !o.longitude)
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({
    example: 'user123',
    description: 'ID du propriétaire (Admin only)'
  })
  @IsOptional()
  @IsString()
  proprietaireId?: string;
}
