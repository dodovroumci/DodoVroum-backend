import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, IsEnum, Min, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { VehicleType } from '@prisma/client';

export class CreateVehicleDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  brand: string;

  @ApiProperty({ example: 'Camry' })
  @IsString()
  model: string;

  @ApiProperty({ example: 2023 })
  @IsInt()
  @Min(1900)
  year: number;

  @ApiProperty({ enum: VehicleType, example: VehicleType.CAR, required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    if (typeof value === 'string') {
      const upperValue = value.toUpperCase();
      // Mapper les valeurs courantes
      const typeMap: Record<string, VehicleType> = {
        'CAR': VehicleType.CAR,
        'VOITURE': VehicleType.CAR,
        'SUV': VehicleType.SUV,
        'MOTORCYCLE': VehicleType.MOTORCYCLE,
        'MOTO': VehicleType.MOTORCYCLE,
        'BICYCLE': VehicleType.BICYCLE,
        'VELO': VehicleType.BICYCLE,
        'SCOOTER': VehicleType.SCOOTER,
        'VAN': VehicleType.VAN,
        'TRUCK': VehicleType.TRUCK,
        'CAMION': VehicleType.TRUCK,
      };
      const mappedValue = typeMap[upperValue];
      if (mappedValue) return mappedValue;
      if (Object.values(VehicleType).includes(upperValue as VehicleType)) {
        return upperValue;
      }
      // Si la valeur n'est pas reconnue, retourner undefined pour que le champ soit ignoré
      return undefined;
    }
    return value;
  })
  @IsString()
  type?: string | VehicleType;

  @ApiProperty({ example: 50.00 })
  @IsNumber()
  @Min(0)
  pricePerDay: number;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiProperty({ example: 5, description: 'Alias pour capacity', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;

  @ApiProperty({ example: 'Essence', required: false })
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiProperty({ example: 'Essence', description: 'Alias pour fuelType', required: false })
  @IsOptional()
  @IsString()
  fuel?: string;

  @ApiProperty({ example: 'Automatique' })
  @IsString()
  transmission: string;

  @ApiProperty({ example: ['Climatisation', 'GPS', 'Bluetooth', 'Sièges chauffants'] })
  @IsArray()
  @IsString({ each: true })
  features: string[];

  @ApiProperty({ example: ['https://example.com/car1.jpg', 'https://example.com/car2.jpg'] })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ example: 'SUV Toyota RAV4 2022 - Confort et Espace', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'SUV Toyota RAV4 2022 - Confort et Espace', description: 'Alias pour title', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Description du véhicule', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'ABC-123-DE', description: 'Numéro de plaque d\'immatriculation', required: false })
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @ApiProperty({ example: 'Cocody, Abidjan', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 45000, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @ApiProperty({ example: 'Blanc', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: 'Excellent état', required: false })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

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
