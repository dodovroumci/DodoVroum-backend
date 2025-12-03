import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ResidencesQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'villa',
    description: 'Filtrer les résidences par type (ex: villa, appartement, studio)',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    example: 'available',
    description: 'Filtrer les résidences par statut (available ou occupied)',
  })
  @IsOptional()
  @IsString()
  status?: 'available' | 'occupied';

  @ApiPropertyOptional({
    example: 'abidjan',
    description: 'Rechercher dans le titre, la description, la ville, l\'adresse ou le pays',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'user123',
    description: 'Filtrer les résidences par propriétaire (ID du propriétaire)',
  })
  @IsOptional()
  @IsString()
  proprietaireId?: string;
}

