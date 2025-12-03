import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, Min, IsInt, ValidateIf, ValidateNested } from 'class-validator';
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
  @ApiProperty({ example: 'Villa de luxe avec piscine', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'Villa de luxe avec piscine', description: 'Alias français pour title', required: false })
  @IsOptional()
  @IsString()
  nom?: string;

  @ApiProperty({ example: 'Magnifique villa avec vue sur mer...', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '123 Rue de la Plage', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: '123 Rue de la Plage', description: 'Alias français pour address', required: false })
  @IsOptional()
  @IsString()
  adresse?: string;

  @ApiProperty({ example: 'Nice', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'Nice', description: 'Alias français pour city', required: false })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiProperty({ example: 'France', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'France', description: 'Alias français pour country', required: false })
  @IsOptional()
  @IsString()
  pays?: string;

  @ApiProperty({ example: 150.50, required: false })
  @ValidateIf((o) => o.pricePerDay !== undefined || !o.pricePerNight)
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerDay?: number;

  @ApiProperty({ example: 150.50, description: 'Alias pour pricePerDay', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerNight?: number;

  @ApiProperty({ example: 150.50, description: 'Alias français pour pricePerDay', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  prixParNuit?: number;

  @ApiProperty({ example: 6, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiProperty({ example: 6, description: 'Alias français pour capacity', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacite?: number;

  @ApiProperty({ example: 3, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  bedrooms?: number;

  @ApiProperty({ example: 3, description: 'Alias français pour bedrooms', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombreChambres?: number;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  bathrooms?: number;

  @ApiProperty({ example: 2, description: 'Alias français pour bathrooms', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  nombreSallesBain?: number;

  @ApiProperty({ example: ['WiFi', 'Piscine', 'Parking', 'Climatisation'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty({ example: ['WiFi', 'Piscine', 'Parking', 'Climatisation'], description: 'Alias français pour amenities', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commodites?: string[];

  @ApiProperty({ example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'] })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ example: 'Villa moderne', required: false })
  @IsOptional()
  @IsString()
  typeResidence?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({ example: 5.3600, required: false })
  @ValidateIf((o) => !o.location)
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ example: -4.0083, required: false })
  @ValidateIf((o) => !o.location)
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({ 
    type: LocationDto, 
    required: false, 
    description: 'Objet location avec latitude et longitude (alternative aux champs séparés)' 
  })
  @ValidateIf((o) => !o.latitude && !o.longitude)
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  // Champ optionnel - utilisé uniquement par les administrateurs pour spécifier un propriétaire différent
  // Pour les non-admins, le propriétaire est automatiquement l'utilisateur connecté
  @ApiProperty({ 
    example: 'user123', 
    required: false,
    description: 'ID du propriétaire (uniquement pour les administrateurs). Par défaut, l\'utilisateur connecté devient le propriétaire.'
  })
  @IsOptional()
  @IsString()
  proprietaireId?: string;
}
