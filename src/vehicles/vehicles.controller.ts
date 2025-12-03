import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';
import { PrismaService } from '../common/prisma/prisma.service';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ 
    summary: 'Créer un véhicule',
    description: 'Les administrateurs peuvent spécifier un propriétaire via proprietaireId. Sinon, l\'utilisateur connecté devient le propriétaire.'
  })
  @ApiResponse({ status: 201, description: 'Véhicule créé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Propriétaire spécifié non trouvé (admin uniquement)' })
  async create(@Body() createVehicleDto: CreateVehicleDto, @Request() req) {
    // Si l'utilisateur est admin et a spécifié un proprietaireId, l'utiliser
    // Sinon, utiliser l'utilisateur connecté comme propriétaire
    let ownerId = req.user.id;
    
    if (req.user.role === 'ADMIN' && createVehicleDto.proprietaireId) {
      // Vérifier que le propriétaire spécifié existe
      const owner = await this.prisma.user.findUnique({
        where: { id: createVehicleDto.proprietaireId },
        select: { id: true, role: true },
      });
      
      if (!owner) {
        throw new NotFoundException('Propriétaire spécifié non trouvé');
      }
      
      ownerId = createVehicleDto.proprietaireId;
    }
    
    return this.vehiclesService.create(createVehicleDto, ownerId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les véhicules' })
  @ApiResponse({ status: 200, description: 'Liste des véhicules' })
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Get('my-vehicles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtenir les véhicules du propriétaire connecté' })
  @ApiResponse({ status: 200, description: 'Liste des véhicules du propriétaire' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  findMyVehicles(@Request() req) {
    return this.vehiclesService.findByOwner(req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Rechercher des véhicules' })
  @ApiQuery({ name: 'q', description: 'Terme de recherche' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche' })
  search(@Query('q') query: string) {
    return this.vehiclesService.search(query);
  }

  @Get('types')
  @ApiOperation({ summary: 'Obtenir tous les types de véhicules disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des types de véhicules' })
  getVehicleTypes() {
    return this.vehiclesService.getVehicleTypes();
  }

  @Get('categories')
  @ApiOperation({ summary: 'Obtenir toutes les catégories de véhicules disponibles (alias de types)' })
  @ApiResponse({ status: 200, description: 'Liste des catégories de véhicules' })
  getVehicleCategories() {
    return this.vehiclesService.getVehicleTypes();
  }

  @Get('type/:type')
  @ApiOperation({ summary: 'Obtenir les véhicules par type' })
  @ApiResponse({ status: 200, description: 'Liste des véhicules du type spécifié' })
  findByType(@Param('type') type: string) {
    return this.vehiclesService.findByType(type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un véhicule par ID' })
  @ApiResponse({ status: 200, description: 'Véhicule trouvé' })
  @ApiResponse({ status: 404, description: 'Véhicule non trouvé' })
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Get(':id/booked-dates')
  @ApiOperation({ summary: 'Récupérer les plages de dates réservées pour un véhicule' })
  @ApiResponse({ status: 200, description: 'Liste des plages réservées' })
  @ApiResponse({ status: 404, description: 'Véhicule non trouvé' })
  getBookedDates(@Param('id') id: string) {
    return this.vehiclesService.getOccupiedDateRanges(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @ApiOperation({ summary: 'Mettre à jour un véhicule' })
  @ApiResponse({ status: 200, description: 'Véhicule mis à jour' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de ce véhicule' })
  @ApiResponse({ status: 404, description: 'Véhicule non trouvé' })
  update(@Param('id') id: string, @Body() updateVehicleDto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @ApiOperation({ summary: 'Supprimer un véhicule' })
  @ApiResponse({ status: 200, description: 'Véhicule supprimé' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous n\'êtes pas propriétaire de ce véhicule' })
  @ApiResponse({ status: 404, description: 'Véhicule non trouvé' })
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
