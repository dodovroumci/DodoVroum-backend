import { Controller, Get, Post, Body, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ 
    summary: 'Ajouter aux favoris',
    description: 'Ajoute une résidence, un véhicule et/ou une offre aux favoris. Si plusieurs IDs sont fournis, plusieurs favoris seront créés en une seule requête.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Ajouté aux favoris avec succès. Retourne un favori unique ou un tableau si plusieurs favoris ont été créés.'
  })
  @ApiResponse({ status: 400, description: 'Données invalides, favori déjà existant, ou offre hors période de validité' })
  @ApiResponse({ status: 404, description: 'Résidence, véhicule ou offre non trouvé' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  create(@Body() createFavoriteDto: CreateFavoriteDto, @Request() req) {
    return this.favoritesService.create(createFavoriteDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les favoris' })
  @ApiResponse({ status: 200, description: 'Liste des favoris' })
  findAll() {
    return this.favoritesService.findAll();
  }

  @Get('my-favorites')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtenir mes favoris' })
  @ApiResponse({ status: 200, description: 'Liste de mes favoris' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  findMyFavorites(@Request() req) {
    return this.favoritesService.findByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un favori par ID' })
  @ApiResponse({ status: 200, description: 'Favori trouvé' })
  @ApiResponse({ status: 404, description: 'Favori non trouvé' })
  findOne(@Param('id') id: string) {
    return this.favoritesService.findOne(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Supprimer des favoris' })
  @ApiResponse({ status: 200, description: 'Supprimé des favoris' })
  @ApiResponse({ status: 404, description: 'Favori non trouvé' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  remove(@Param('id') id: string) {
    return this.favoritesService.remove(id);
  }

  @Delete('residence/:residenceId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Supprimer une résidence des favoris' })
  @ApiResponse({ status: 200, description: 'Résidence supprimée des favoris' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  removeResidence(@Param('residenceId') residenceId: string, @Request() req) {
    return this.favoritesService.removeByUserAndItem(req.user.id, residenceId);
  }

  @Delete('vehicle/:vehicleId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Supprimer un véhicule des favoris' })
  @ApiResponse({ status: 200, description: 'Véhicule supprimé des favoris' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  removeVehicle(@Param('vehicleId') vehicleId: string, @Request() req) {
    return this.favoritesService.removeByUserAndItem(req.user.id, undefined, vehicleId);
  }

  @Delete('offer/:offerId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Supprimer une offre des favoris' })
  @ApiResponse({ status: 200, description: 'Offre supprimée des favoris' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  removeOffer(@Param('offerId') offerId: string, @Request() req) {
    return this.favoritesService.removeByUserAndItem(req.user.id, undefined, undefined, offerId);
  }
}
