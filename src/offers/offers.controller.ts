import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OffersQueryDto } from './dto/offers-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OfferOwnerGuard } from './guards/offer-owner.guard';

@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ 
    summary: 'Créer une offre combinée',
    description: 'Crée une offre combinée. Le véhicule et la résidence doivent appartenir au même propriétaire. Les administrateurs peuvent créer des offres pour d\'autres propriétaires.'
  })
  @ApiResponse({ status: 201, description: 'Offre créée avec succès' })
  @ApiResponse({ status: 400, description: 'Le véhicule et la résidence doivent appartenir au même propriétaire' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Résidence ou véhicule non trouvé' })
  async create(@Body() createOfferDto: CreateOfferDto, @Request() req) {
    // Si l'utilisateur est admin, ne pas passer ownerId pour permettre la création pour d'autres propriétaires
    // Le service utilisera automatiquement le propriétaire de la résidence/véhicule
    // Si l'utilisateur n'est pas admin, passer son ID pour vérifier qu'il est propriétaire
    const ownerId = req.user.role === 'ADMIN' ? undefined : req.user.id;
    return this.offersService.create(createOfferDto, ownerId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir toutes les offres avec filtres optionnels' })
  @ApiResponse({ status: 200, description: 'Liste des offres' })
  findAll(@Query() query: OffersQueryDto) {
    // Normaliser owner_id vers proprietaireId si nécessaire
    const normalizedQuery = { ...query };
    if (normalizedQuery.owner_id && !normalizedQuery.proprietaireId) {
      normalizedQuery.proprietaireId = normalizedQuery.owner_id;
      delete normalizedQuery.owner_id;
    }
    const { proprietaireId, owner_id, ...paginationOptions } = normalizedQuery;
    return this.offersService.findAll({ 
      proprietaireId, 
      ...paginationOptions 
    });
  }

  @Get('my-offers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtenir les offres du propriétaire connecté' })
  @ApiResponse({ status: 200, description: 'Liste des offres du propriétaire' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  findMyOffers(@Request() req) {
    return this.offersService.findByOwner(req.user.id);
  }

  @Get('owner-properties')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtenir les offres du propriétaire connecté (alias pour my-offers)' })
  @ApiResponse({ status: 200, description: 'Liste des offres du propriétaire' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  findOwnerProperties(@Request() req) {
    return this.offersService.findByOwner(req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Rechercher des offres combinées' })
  @ApiQuery({ name: 'q', description: 'Terme de recherche' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche' })
  search(@Query('q') query: string) {
    return this.offersService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une offre par ID' })
  @ApiResponse({ status: 200, description: 'Offre trouvée' })
  @ApiResponse({ status: 404, description: 'Offre non trouvée' })
  findOne(@Param('id') id: string) {
    return this.offersService.findOne(id);
  }

  @Get(':id/booked-dates')
  @ApiOperation({ summary: 'Récupérer les plages de dates réservées pour une offre combinée' })
  @ApiResponse({ status: 200, description: 'Liste des plages réservées' })
  @ApiResponse({ status: 404, description: 'Offre non trouvée' })
  getBookedDates(@Param('id') id: string) {
    return this.offersService.getOccupiedDateRanges(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, OfferOwnerGuard)
  @ApiOperation({ 
    summary: 'Mettre à jour une offre',
    description: 'Met à jour une offre combinée. Si le véhicule ou la résidence est modifié, ils doivent appartenir au même propriétaire.'
  })
  @ApiResponse({ status: 200, description: 'Offre mise à jour' })
  @ApiResponse({ status: 400, description: 'Le véhicule et la résidence doivent appartenir au même propriétaire' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de cette offre' })
  @ApiResponse({ status: 404, description: 'Offre, résidence ou véhicule non trouvé' })
  update(@Param('id') id: string, @Body() updateOfferDto: UpdateOfferDto) {
    return this.offersService.update(id, updateOfferDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, OfferOwnerGuard)
  @ApiOperation({ summary: 'Supprimer une offre' })
  @ApiResponse({ status: 200, description: 'Offre supprimée' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de cette offre' })
  @ApiResponse({ status: 404, description: 'Offre non trouvée' })
  remove(@Param('id') id: string) {
    return this.offersService.remove(id);
  }
}
