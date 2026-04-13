import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Créer un avis',
    description: 'Crée un avis pour une réservation. Le bookingId est obligatoire et doit vous appartenir. Les IDs de résidence/véhicule seront déduits du booking si non fournis.'
  })
  @ApiResponse({ status: 201, description: 'Avis créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides, avis déjà existant pour cette réservation, ou item non disponible' })
  @ApiResponse({ status: 403, description: 'Vous ne pouvez pas créer un avis pour une réservation qui ne vous appartient pas' })
  @ApiResponse({ status: 404, description: 'Réservation, résidence ou véhicule non trouvé' })
  create(@Body() createReviewDto: CreateReviewDto, @Request() req) {
    return this.reviewsService.create(createReviewDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les avis' })
  @ApiResponse({ status: 200, description: 'Liste des avis' })
  findAll() {
    return this.reviewsService.findAll();
  }

  @Get('residence/:residenceId')
  @ApiOperation({ summary: 'Obtenir les avis d\'une résidence' })
  @ApiResponse({ status: 200, description: 'Liste des avis de la résidence' })
  findByResidence(@Param('residenceId') residenceId: string) {
    return this.reviewsService.findByResidence(residenceId);
  }

  @Get('vehicle/:vehicleId')
  @ApiOperation({ summary: 'Obtenir les avis d\'un véhicule' })
  @ApiResponse({ status: 200, description: 'Liste des avis du véhicule' })
  findByVehicle(@Param('vehicleId') vehicleId: string) {
    return this.reviewsService.findByVehicle(vehicleId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un avis par ID' })
  @ApiResponse({ status: 200, description: 'Avis trouvé' })
  @ApiResponse({ status: 404, description: 'Avis non trouvé' })
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un avis' })
  @ApiResponse({ status: 200, description: 'Avis mis à jour' })
  @ApiResponse({ status: 404, description: 'Avis non trouvé' })
  update(@Param('id') id: string, @Body() updateReviewDto: UpdateReviewDto) {
    return this.reviewsService.update(id, updateReviewDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un avis' })
  @ApiResponse({ status: 200, description: 'Avis supprimé' })
  @ApiResponse({ status: 404, description: 'Avis non trouvé' })
  remove(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }
}
