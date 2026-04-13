import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ResidencesService } from './residences.service';
import { CreateResidenceDto } from './dto/create-residence.dto';
import { UpdateResidenceDto } from './dto/update-residence.dto';
import { ResidencesQueryDto } from './dto/residences-query.dto';
import { BlockDateDto } from './dto/block-date.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResidenceOwnerGuard } from './guards/residence-owner.guard';
import { PrismaService } from '../common/prisma/prisma.service';

@ApiTags('Residences')
@Controller('residences')
export class ResidencesController {
  constructor(
    private readonly residencesService: ResidencesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ 
    summary: 'Créer une résidence',
    description: 'Les administrateurs peuvent spécifier un propriétaire via proprietaireId. Sinon, l\'utilisateur connecté devient le propriétaire.'
  })
  @ApiResponse({ status: 201, description: 'Résidence créée avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Propriétaire spécifié non trouvé (admin uniquement)' })
  async create(@Body() createResidenceDto: CreateResidenceDto, @Request() req) {
    // Si l'utilisateur est admin et a spécifié un proprietaireId, l'utiliser
    // Sinon, utiliser l'utilisateur connecté comme propriétaire
    let ownerId = req.user.id;
    
    if (req.user.role === 'ADMIN' && createResidenceDto.proprietaireId) {
      // Vérifier que le propriétaire spécifié existe
      const owner = await this.prisma.user.findUnique({
        where: { id: createResidenceDto.proprietaireId },
        select: { id: true, role: true },
      });
      
      if (!owner) {
        throw new NotFoundException('Propriétaire spécifié non trouvé');
      }
      
      ownerId = createResidenceDto.proprietaireId;
    }
    
    return this.residencesService.create(createResidenceDto, ownerId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir toutes les résidences avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste paginée des résidences' })
  findAll(@Query() query: ResidencesQueryDto) {
    // Normaliser owner_id vers proprietaireId si nécessaire
    const normalizedQuery = { ...query };
    if (normalizedQuery.owner_id && !normalizedQuery.proprietaireId) {
      normalizedQuery.proprietaireId = normalizedQuery.owner_id;
      delete normalizedQuery.owner_id;
    }
    return this.residencesService.findAll(normalizedQuery);
  }

  @Get('my-residences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtenir les résidences du propriétaire connecté' })
  @ApiResponse({ status: 200, description: 'Liste paginée des résidences du propriétaire' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  findMyResidences(@Query() paginationDto: ResidencesQueryDto, @Request() req) {
    return this.residencesService.findByOwner(req.user.id, paginationDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Rechercher des résidences (endpoint dédié)' })
  @ApiQuery({ name: 'q', description: 'Terme de recherche', required: true })
  @ApiResponse({ status: 200, description: 'Résultats de recherche paginés' })
  search(@Query('q') query: string, @Query() queryDto: ResidencesQueryDto) {
    const { search, ...options } = queryDto;
    return this.residencesService.search(query, options);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une résidence par ID' })
  @ApiResponse({ status: 200, description: 'Résidence trouvée' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  findOne(@Param('id') id: string) {
    return this.residencesService.findOne(id);
  }

  @Get(':id/booked-dates')
  @ApiOperation({ summary: 'Récupérer la liste exhaustive des dates indisponibles (Format: YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Tableau de strings des dates occupées' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  async getBookedDates(@Param('id') id: string) {
    // On appelle la nouvelle méthode qui fusionne réservations + blocages manuels
    return this.residencesService.getBookedDates(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Vérifier la disponibilité et calculer le prix avec réductions' })
  @ApiQuery({ name: 'startDate', description: 'Date de début (ISO 8601)', example: '2024-06-01' })
  @ApiQuery({ name: 'endDate', description: 'Date de fin (ISO 8601)', example: '2024-06-07' })
  @ApiResponse({ status: 200, description: 'Disponibilité et prix calculé' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  checkAvailability(
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.residencesService.checkAvailability(
      id,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ResidenceOwnerGuard)
  @ApiOperation({ summary: 'Mettre à jour une résidence' })
  @ApiResponse({ status: 200, description: 'Résidence mise à jour' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de cette résidence' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  update(@Param('id') id: string, @Body() updateResidenceDto: UpdateResidenceDto) {
    return this.residencesService.update(id, updateResidenceDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ResidenceOwnerGuard)
  @ApiOperation({ summary: 'Supprimer une résidence' })
  @ApiResponse({ status: 200, description: 'Résidence supprimée' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de cette résidence' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  remove(@Param('id') id: string) {
    return this.residencesService.remove(id);
  }

  @Post(':id/blocked-dates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ResidenceOwnerGuard)
  @ApiOperation({ summary: 'Bloquer des dates pour une résidence' })
  @ApiResponse({ status: 201, description: 'Dates bloquées avec succès' })
  @ApiResponse({ status: 400, description: 'Dates invalides ou conflit avec des réservations existantes' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de cette résidence' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  blockDates(@Param('id') id: string, @Body() blockDateDto: BlockDateDto) {
    return this.residencesService.blockDates(id, blockDateDto);
  }

  @Get(':id/blocked-dates')
  @ApiOperation({ summary: 'Récupérer toutes les dates bloquées d\'une résidence' })
  @ApiResponse({ status: 200, description: 'Liste des dates bloquées' })
  @ApiResponse({ status: 404, description: 'Résidence non trouvée' })
  getBlockedDates(@Param('id') id: string) {
    return this.residencesService.getBlockedDates(id);
  }

  @Delete(':id/blocked-dates/:blockedDateId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ResidenceOwnerGuard)
  @ApiOperation({ summary: 'Supprimer une période de dates bloquées' })
  @ApiResponse({ status: 200, description: 'Période bloquée supprimée avec succès' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de cette résidence' })
  @ApiResponse({ status: 404, description: 'Résidence ou période bloquée non trouvée' })
  unblockDates(@Param('id') id: string, @Param('blockedDateId') blockedDateId: string) {
    return this.residencesService.unblockDates(id, blockedDateId);
  }
}
