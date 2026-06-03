import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class OffersQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'user123',
    description: 'Filtrer les offres par propriétaire (ID du propriétaire). Accepte aussi owner_id comme alias.',
  })
  @IsOptional()
  @IsString()
  proprietaireId?: string;

  @ApiPropertyOptional({
    example: 'active',
    description: "Filtrer les offres par statut : 'active', 'inactive', 'expired', 'expiree'",
    enum: ['active', 'inactive', 'expired', 'expiree'],
  })
  @IsOptional()
  @IsIn(['active', 'inactive', 'expired', 'expiree'])
  status?: string;

  // Propriété optionnelle pour accepter owner_id (alias de proprietaireId)
  // Normalisée dans le contrôleur vers proprietaireId
  @ApiPropertyOptional({
    example: 'user123',
    description: 'Alias pour proprietaireId - Filtrer les offres par propriétaire (ID du propriétaire)',
  })
  @IsOptional()
  @IsString()
  owner_id?: string;
}
