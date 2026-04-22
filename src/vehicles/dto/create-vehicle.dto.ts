import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsBoolean, Min } from 'class-validator';

/**
 * DTO pour la création de véhicule.
 * Version exhaustive pour supporter l'intégralité du payload Laravel.
 */
export class CreateVehicleDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  brand: string;

  @ApiProperty({ example: 'Corolla' })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({ example: 'Véhicule très confortable...', required: false })
  @IsOptional()
  @IsString()
  description?: string; // AJOUTÉ : Pour corriger l'erreur de build

  @ApiProperty({ description: 'Type de véhicule', example: 'berline' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 45.5 })
  @IsNumber()
  @Min(0)
  pricePerDay: number;

  @ApiProperty({ example: 'AB-123-CD', required: false })
  @IsString()
  @IsOptional()
  licensePlate?: string;

  @ApiProperty({ example: 'AB-123-CD', required: false })
  @IsString()
  @IsOptional()
  plateNumber?: string;

  @ApiProperty({ example: 2023 })
  @IsNumber()
  year: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  seats: number;

  @ApiProperty({ example: 'Rouge', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: 15000, required: false })
  @IsOptional()
  @IsNumber()
  mileage?: number;

  @ApiProperty({ example: 'Essence', required: false })
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiProperty({ example: 'Manuelle', required: false })
  @IsOptional()
  @IsString()
  transmission?: string;

  @ApiProperty({ example: ['url1', 'url2'], required: false })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiProperty({ example: ['GPS', 'AC'], required: false })
  @IsArray()
  @IsOptional()
  features?: string[];

  @ApiProperty({ example: 'uuid-proprietaire', required: false })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({ example: 'uuid-proprietaire', required: false })
  @IsOptional()
  @IsString()
  proprietaireId?: string;

  @ApiProperty({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
