import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty({ 
    example: 'residence-id-123', 
    required: false,
    description: 'ID de la résidence à ajouter aux favoris. Peut être combiné avec vehicleId ou offerId pour créer plusieurs favoris en une seule requête.'
  })
  @IsOptional()
  @IsString()
  residenceId?: string;

  @ApiProperty({ 
    example: 'vehicle-id-456', 
    required: false,
    description: 'ID du véhicule à ajouter aux favoris. Peut être combiné avec residenceId ou offerId pour créer plusieurs favoris en une seule requête.'
  })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ 
    example: 'offer-id-789', 
    required: false,
    description: 'ID de l\'offre combinée à ajouter aux favoris. Peut être combiné avec residenceId ou vehicleId pour créer plusieurs favoris en une seule requête.'
  })
  @IsOptional()
  @IsString()
  offerId?: string;
}
