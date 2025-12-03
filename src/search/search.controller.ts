import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Recherche globale',
    description: 'Recherche dans les résidences, véhicules et offres combinées en une seule requête'
  })
  @ApiQuery({ 
    name: 'q', 
    description: 'Terme de recherche', 
    example: 'abidjan',
    required: true 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Résultats de recherche combinés',
    schema: {
      type: 'object',
      properties: {
        residences: {
          type: 'array',
          description: 'Liste des résidences trouvées'
        },
        vehicles: {
          type: 'array',
          description: 'Liste des véhicules trouvés'
        },
        offers: {
          type: 'array',
          description: 'Liste des offres combinées trouvées'
        },
        total: {
          type: 'number',
          description: 'Nombre total de résultats'
        },
        query: {
          type: 'string',
          description: 'Terme de recherche utilisé'
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Paramètre de recherche manquant' })
  async globalSearch(@Query('q') query: string) {
    if (!query || query.trim().length === 0) {
      return {
        residences: [],
        vehicles: [],
        offers: [],
        total: 0,
        query: query || '',
      };
    }

    return this.searchService.globalSearch(query.trim());
  }
}

