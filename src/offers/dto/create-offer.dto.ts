import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsDateString, Min } from 'class-validator';

export class CreateOfferDto {
  @ApiProperty({ example: 'Package Villa + Voiture de luxe' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Offre spéciale villa avec piscine + voiture premium' })
  @IsString()
  description: string;

  @ApiProperty({ example: 300000.00 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 7 })
  @IsNumber()
  @Min(1)
  nbJours: number;

  @ApiProperty({ example: 10.0, required: false })
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiProperty({ example: 'https://cdn.dodovroum.com/offers/pack1.jpg', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({ example: 'residence-id-123' })
  @IsString()
  residenceId: string;

  @ApiProperty({ example: 'vehicle-id-456' })
  @IsString()
  vehicleId: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ example: '2024-12-31T23:59:59Z' })
  @IsDateString()
  validTo: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
