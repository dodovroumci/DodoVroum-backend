import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class OffersQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'user123',
    description: 'Filtrer les offres par propriétaire (ID du propriétaire). Accepte aussi owner_id comme alias.',
  })
  @IsOptional()
  @IsString()
  proprietaireId?: string;

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
