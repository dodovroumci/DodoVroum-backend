import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ 
    example: 5, 
    minimum: 1, 
    maximum: 5,
    description: 'Note de 1 à 5 étoiles'
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ 
    example: 'Excellent séjour, je recommande !', 
    required: false,
    description: 'Commentaire optionnel'
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ 
    example: 'booking-id-123',
    description: 'ID de la réservation. La réservation doit vous appartenir et exister.'
  })
  @IsString()
  bookingId: string;

  @ApiProperty({ 
    example: 'residence-id-456', 
    required: false,
    description: 'ID de la résidence (optionnel si fourni dans le booking). Si non fourni, sera déduit du booking.'
  })
  @IsOptional()
  @IsString()
  residenceId?: string;

  @ApiProperty({ 
    example: 'vehicle-id-789', 
    required: false,
    description: 'ID du véhicule (optionnel si fourni dans le booking). Si non fourni, sera déduit du booking.'
  })
  @IsOptional()
  @IsString()
  vehicleId?: string;
}
