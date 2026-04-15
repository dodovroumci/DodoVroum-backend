import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateBookingDatesDto } from './dto/update-booking-dates.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingOwnerOrAdminGuard } from './guards/booking-owner-or-admin.guard';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une réservation' })
  @ApiResponse({ status: 201, description: 'Réservation créée avec succès' })
  create(@Body() createBookingDto: CreateBookingDto, @Request() req) {
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir toutes les réservations' })
  @ApiResponse({ status: 200, description: 'Liste des réservations' })
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Obtenir mes réservations (en tant que client)' })
  @ApiResponse({ status: 200, description: 'Liste de mes réservations' })
  findMyBookings(@Request() req) {
    return this.bookingsService.findByUser(req.user.id);
  }

  @Get('my-properties-bookings')
  @ApiOperation({ summary: 'Obtenir les réservations de mes propriétés (en tant que propriétaire)' })
  @ApiResponse({ status: 200, description: 'Liste des réservations de mes propriétés (résidences, véhicules, offres)' })
  findMyPropertiesBookings(@Request() req) {
    return this.bookingsService.findByOwner(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une réservation par ID' })
  @ApiResponse({ status: 200, description: 'Réservation trouvée' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id/dates')
  @ApiOperation({
    summary: 'Reporter ou modifier les dates d\'une réservation',
    description:
      'Vérifie la disponibilité (hors cette réservation), le statut (pas après clé / séjour / annulation) et recalcule le prix total.',
  })
  @ApiResponse({ status: 200, description: 'Dates mises à jour' })
  @ApiResponse({ status: 400, description: 'Report impossible ou dates invalides' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  @ApiResponse({ status: 409, description: 'Créneau déjà occupé ou bloqué' })
  updateDates(@Param('id') id: string, @Body() dto: UpdateBookingDatesDto) {
    return this.bookingsService.updateBookingDates(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une réservation' })
  @ApiResponse({ status: 200, description: 'Réservation mise à jour' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  update(@Param('id') id: string, @Body() updateBookingDto: UpdateBookingDto) {
    return this.bookingsService.update(id, updateBookingDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une réservation' })
  @ApiResponse({ status: 200, description: 'Réservation supprimée' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Approuver une réservation',
    description: 'Passe une réservation de PENDING à CONFIRMED. Seul le propriétaire de la résidence/véhicule/offre ou un administrateur peut approuver.'
  })
  @ApiResponse({ status: 200, description: 'Réservation approuvée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  approve(@Param('id') id: string) {
    return this.bookingsService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Rejeter une réservation',
    description: 'Passe une réservation de PENDING à CANCELLED. Seul le propriétaire de la résidence/véhicule/offre ou un administrateur peut rejeter.'
  })
  @ApiResponse({ status: 200, description: 'Réservation rejetée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  reject(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.bookingsService.reject(id, body?.reason);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard, BookingOwnerOrAdminGuard)
  @ApiOperation({ summary: 'Confirmer une réservation' })
  @ApiResponse({ status: 200, description: 'Réservation confirmée avec succès' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  confirmBooking(@Param('id') id: string) {
    return this.bookingsService.updateStatus(id, BookingStatus.CONFIRMED);
  }

  @Patch(':id/confirm-key-retrieval')
  @ApiOperation({ 
    summary: 'Confirmer la récupération de clé par le client',
    description: 'Passe une réservation de CONFIRMEE à CHECKIN_CLIENT. Seul le client propriétaire de la réservation peut confirmer.'
  })
  @ApiResponse({ status: 200, description: 'Récupération de clé confirmée avec succès' })
  @ApiResponse({ status: 400, description: 'Action non autorisée ou conditions non remplies' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  confirmKeyRetrieval(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmKeyRetrieval(id, req.user.id);
  }

  @Patch(':id/confirm-owner-key-handover')
  @UseGuards(JwtAuthGuard, BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Confirmer la remise de clé par le propriétaire',
    description: 'Passe une réservation de CHECKIN_CLIENT à CHECKIN_PROPRIO, puis automatiquement à EN_COURS_SEJOUR si les deux ont confirmé. Seul le propriétaire peut confirmer.'
  })
  @ApiResponse({ status: 200, description: 'Remise de clé confirmée avec succès' })
  @ApiResponse({ status: 400, description: 'Action non autorisée ou conditions non remplies' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  confirmOwnerKeyHandover(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmOwnerKeyHandover(id, req.user.id);
  }

  @Patch(':id/confirm-checkout')
  @ApiOperation({ 
    summary: 'Confirmer le check-out par le client',
    description: 'Passe une réservation de EN_COURS_SEJOUR à TERMINEE. Seul le client propriétaire de la réservation peut confirmer.'
  })
  @ApiResponse({ status: 200, description: 'Check-out confirmé avec succès' })
  @ApiResponse({ status: 400, description: 'Action non autorisée ou conditions non remplies' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  confirmCheckOut(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmCheckOut(id, req.user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Annuler une réservation (client)',
    description:
      'Permet au client d\'annuler sa réservation tant qu\'elle est en statut PENDING. ' +
      'Si la réservation est déjà approuvée, l\'annulation est refusée et le client doit demander un changement de dates.',
  })
  @ApiResponse({ status: 200, description: 'Réservation annulée avec succès' })
  @ApiResponse({ status: 400, description: 'Action non autorisée ou réservation déjà approuvée/annulée' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  cancel(@Param('id') id: string, @Request() req) {
    return this.bookingsService.cancelByClient(id, req.user.id);
  }
}
