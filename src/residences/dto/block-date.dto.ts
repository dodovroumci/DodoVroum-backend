import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, IsOptional, ValidateIf } from 'class-validator';

export class BlockDateDto {
  @ApiProperty({ 
    example: '2024-06-01T00:00:00Z', 
    description: 'Date de début de la période bloquée' 
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ 
    example: '2024-06-07T23:59:59Z', 
    description: 'Date de fin de la période bloquée' 
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({ 
    example: 'Maintenance prévue', 
    description: 'Raison du blocage (optionnel)', 
    required: false 
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

