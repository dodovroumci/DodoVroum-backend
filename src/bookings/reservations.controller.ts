import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingOwnerOrAdminGuard } from './guards/booking-owner-or-admin.guard';

/**
 * Contrôleur d'alias pour /api/reservations
 * Redirige vers BookingsService pour maintenir la compatibilité avec le frontend
 * Accepte les propriétés en français (residence_id, date_debut, etc.) et les transforme
 */
@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Transforme un CreateReservationDto (français) en CreateBookingDto (anglais)
   */
  private transformReservationToBooking(dto: CreateReservationDto): CreateBookingDto {
    const bookingDto: CreateBookingDto = {
      startDate: dto.startDate || dto.date_debut,
      endDate: dto.endDate || dto.date_fin,
    };

    // Ajouter les IDs si présents
    if (dto.residenceId || dto.residence_id) {
      bookingDto.residenceId = dto.residenceId || dto.residence_id;
    }
    if (dto.vehicleId || dto.vehicle_id || dto.voiture_id) {
      bookingDto.vehicleId = dto.vehicleId || dto.vehicle_id || dto.voiture_id;
    }
    if (dto.offerId || dto.offer_id) {
      bookingDto.offerId = dto.offerId || dto.offer_id;
    }

    // Compatibilité "package": si le frontend envoie packageId / package_id,
    // on le mappe sur offerId (un package correspond à une offre combinée).
    if (!bookingDto.offerId && (dto.packageId || dto.package_id)) {
      bookingDto.offerId = dto.packageId || dto.package_id;
    }

    // Ajouter le prix si présent
    if (dto.totalPrice !== undefined || dto.prix_total !== undefined) {
      bookingDto.totalPrice = dto.totalPrice !== undefined ? dto.totalPrice : dto.prix_total;
    }

    // Option de paiement (acompte ou totalité)
    const paymentOption = dto.paymentOption || dto.option_paiement;
    if (paymentOption) {
      bookingDto.paymentOption = paymentOption as 'DOWN_PAYMENT' | 'FULL_PAYMENT';
    }

    // Montant d'acompte si fourni
    const downPaymentAmount = dto.downPaymentAmount ?? dto.montant_acompte;
    if (downPaymentAmount !== undefined) {
      bookingDto.downPaymentAmount = downPaymentAmount;
    }

    // Méthode de paiement choisie
    if (dto.paymentMethod || dto.methode_paiement) {
      bookingDto.paymentMethod = dto.paymentMethod || dto.methode_paiement;
    }

    // Ajouter les notes si présentes
    if (dto.notes) {
      bookingDto.notes = dto.notes;
    }

    return bookingDto;
  }

  @Post('residences')
  @ApiOperation({ summary: 'Créer une réservation de résidence' })
  @ApiResponse({ status: 201, description: 'Réservation créée avec succès' })
  createResidenceBooking(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Créer une réservation de véhicule' })
  @ApiResponse({ status: 201, description: 'Réservation créée avec succès' })
  createVehicleBooking(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Post('offers')
  @ApiOperation({ summary: 'Créer une réservation d\'offre combinée' })
  @ApiResponse({ status: 201, description: 'Réservation créée avec succès' })
  createOfferBooking(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  // Alias pour compatibilité avec le frontend mobile qui appelle /reservations/packages
  @Post('packages')
  @ApiOperation({ summary: 'Créer une réservation de package (alias offre combinée)' })
  @ApiResponse({ status: 201, description: 'Réservation créée avec succès' })
  createPackageBooking(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une réservation (générique)' })
  @ApiResponse({ status: 201, description: 'Réservation créée avec succès' })
  create(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir toutes les réservations' })
  @ApiResponse({ status: 200, description: 'Liste des réservations' })
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get('my-reservations')
  @ApiOperation({ summary: 'Obtenir mes réservations' })
  @ApiResponse({ status: 200, description: 'Liste de mes réservations' })
  findMyReservations(@Request() req) {
    return this.bookingsService.findByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une réservation par ID' })
  @ApiResponse({ status: 200, description: 'Réservation trouvée' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
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
  @UseGuards(BookingOwnerOrAdminGuard)
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
  @UseGuards(BookingOwnerOrAdminGuard)
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

  // Endpoints spécifiques pour les réservations de véhicules
  @Patch('vehicles/:id/approve')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Approuver une réservation de véhicule',
    description: 'Passe une réservation de véhicule de PENDING à CONFIRMED. Seul le propriétaire du véhicule ou un administrateur peut approuver.'
  })
  @ApiResponse({ status: 200, description: 'Réservation de véhicule approuvée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire du véhicule ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  approveVehicleBooking(@Param('id') id: string) {
    return this.bookingsService.approve(id);
  }

  @Patch('vehicles/:id/reject')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Rejeter une réservation de véhicule',
    description: 'Passe une réservation de véhicule de PENDING à CANCELLED. Seul le propriétaire du véhicule ou un administrateur peut rejeter.'
  })
  @ApiResponse({ status: 200, description: 'Réservation de véhicule rejetée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire du véhicule ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  rejectVehicleBooking(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.bookingsService.reject(id, body?.reason);
  }

  // Endpoints spécifiques pour les réservations d'offres combinées
  @Patch('offers/:id/approve')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Approuver une réservation d\'offre combinée',
    description: 'Passe une réservation d\'offre combinée de PENDING à CONFIRMED. Seul le propriétaire de l\'offre ou un administrateur peut approuver.'
  })
  @ApiResponse({ status: 200, description: 'Réservation d\'offre combinée approuvée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire de l\'offre ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  approveOfferBooking(@Param('id') id: string) {
    return this.bookingsService.approve(id);
  }

  @Patch('offers/:id/reject')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Rejeter une réservation d\'offre combinée',
    description: 'Passe une réservation d\'offre combinée de PENDING à CANCELLED. Seul le propriétaire de l\'offre ou un administrateur peut rejeter.'
  })
  @ApiResponse({ status: 200, description: 'Réservation d\'offre combinée rejetée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire de l\'offre ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  rejectOfferBooking(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.bookingsService.reject(id, body?.reason);
  }

  // Endpoints spécifiques pour les réservations de résidences (pour cohérence)
  @Patch('residences/:id/approve')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Approuver une réservation de résidence',
    description: 'Passe une réservation de résidence de PENDING à CONFIRMED. Seul le propriétaire de la résidence ou un administrateur peut approuver.'
  })
  @ApiResponse({ status: 200, description: 'Réservation de résidence approuvée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire de la résidence ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  approveResidenceBooking(@Param('id') id: string) {
    return this.bookingsService.approve(id);
  }

  @Patch('residences/:id/reject')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ 
    summary: 'Rejeter une réservation de résidence',
    description: 'Passe une réservation de résidence de PENDING à CANCELLED. Seul le propriétaire de la résidence ou un administrateur peut rejeter.'
  })
  @ApiResponse({ status: 200, description: 'Réservation de résidence rejetée avec succès' })
  @ApiResponse({ status: 400, description: 'La réservation n\'est pas en attente' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire de la résidence ou administrateur' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  rejectResidenceBooking(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.bookingsService.reject(id, body?.reason);
  }

  @Patch(':id/confirm-key-retrieval')
  @ApiOperation({ summary: 'Confirmer la récupération de clé par le client' })
  @ApiResponse({ status: 200, description: 'Récupération de clé confirmée avec succès' })
  @ApiResponse({ status: 400, description: 'Action non autorisée ou conditions non remplies' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  confirmKeyRetrieval(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmKeyRetrieval(id, req.user.id);
  }

  @Patch(':id/confirm-owner-key-handover')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ summary: 'Confirmer la remise de clé par le propriétaire' })
  @ApiResponse({ status: 200, description: 'Remise de clé confirmée avec succès' })
  @ApiResponse({ status: 400, description: 'Action non autorisée ou conditions non remplies' })
  @ApiResponse({ status: 403, description: 'Accès interdit - Vous devez être propriétaire' })
  @ApiResponse({ status: 404, description: 'Réservation non trouvée' })
  confirmOwnerKeyHandover(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmOwnerKeyHandover(id, req.user.id);
  }

  @Patch(':id/confirm-checkout')
  @ApiOperation({ summary: 'Confirmer le check-out par le client' })
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

