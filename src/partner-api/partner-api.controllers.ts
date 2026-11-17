import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  PartnerAvailabilityQueryDto,
  PartnerResidencesQueryDto,
} from './dto/partner-api-query.dto';
import { PartnerApiKeyGuard } from './partner-api-key.guard';
import { PartnerApiExceptionFilter } from './partner-api.errors';
import {
  PARTNER_AVAILABILITY_LIMIT,
  PARTNER_READ_LIMIT,
  PartnerThrottlerGuard,
  PUBLIC_DETAIL_LIMIT,
  QUOTA_WINDOW_MS,
} from './partner-api-throttling';
import { PublicResidencesService } from './public-residences.service';

/**
 * Validation propre à ces API (indépendante de la configuration de main.ts) :
 * paramètre inconnu → 400, conversion des nombres.
 */
const STRICT_QUERY_VALIDATION = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/**
 * API publique, consommée par la page web https://dodovroum.com/r/{id}.
 * Aucune clé : uniquement la fiche (pas de liste, pour limiter l'aspiration du
 * catalogue), quota par IP, réponse en cache court.
 */
@ApiTags('Public API v1')
@Controller('public/v1/residences')
@UseFilters(PartnerApiExceptionFilter)
@UseGuards(ThrottlerGuard)
@UsePipes(STRICT_QUERY_VALIDATION)
export class PublicResidencesController {
  constructor(private readonly residences: PublicResidencesService) {}

  @Get(':id')
  @Throttle({ default: { limit: PUBLIC_DETAIL_LIMIT, ttl: QUOTA_WINDOW_MS } })
  @Header('Cache-Control', 'public, max-age=60')
  async getResidence(@Param('id') id: string) {
    return { data: await this.residences.getResidence(id) };
  }
}

/**
 * API partenaire (GPT de Babi), lecture seule, clé X-API-Key obligatoire.
 * Ordre des gardes : authentification, puis quota par partenaire.
 */
@ApiTags('Partner API v1')
@ApiHeader({
  name: 'X-API-Key',
  required: true,
  description: 'Clé d’API partenaire',
})
@Controller('partner/v1/residences')
@UseFilters(PartnerApiExceptionFilter)
@UseGuards(PartnerApiKeyGuard, PartnerThrottlerGuard)
@UsePipes(STRICT_QUERY_VALIDATION)
@Throttle({ default: { limit: PARTNER_READ_LIMIT, ttl: QUOTA_WINDOW_MS } })
export class PartnerResidencesController {
  constructor(private readonly residences: PublicResidencesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Catalogue des résidences éligibles (recherche, filtres, pagination)',
  })
  @Header('Cache-Control', 'no-store')
  async search(@Query() query: PartnerResidencesQueryDto) {
    return this.residences.searchResidences(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche publique d’une résidence' })
  @Header('Cache-Control', 'no-store')
  async getResidence(@Param('id') id: string) {
    return { data: await this.residences.getResidence(id) };
  }

  @Get(':id/availability')
  @ApiOperation({
    summary: 'Disponibilité et prix estimé pour un séjour [checkIn, checkOut[',
  })
  @Throttle({
    default: { limit: PARTNER_AVAILABILITY_LIMIT, ttl: QUOTA_WINDOW_MS },
  })
  @Header('Cache-Control', 'no-store')
  async getAvailability(
    @Param('id') id: string,
    @Query() query: PartnerAvailabilityQueryDto,
  ) {
    return {
      data: await this.residences.getAvailability(
        id,
        query.checkIn,
        query.checkOut,
      ),
    };
  }
}
