/**
 * @file src/bookings/reservations.controller.ts
 * @description Controller pour la gestion des réservations avec transformation DTO hybride.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingOwnerOrAdminGuard } from './guards/booking-owner-or-admin.guard';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * @method transformReservationToBooking
   * @description Mappe le DTO hybride (FR/EN) vers le DTO interne de création.
   */
  private transformReservationToBooking(dto: CreateReservationDto): CreateBookingDto {
    const bookingDto = new CreateBookingDto();

    // Mapping des identifiants (Priorité Anglais)
    bookingDto.residenceId = dto.residenceId || dto.residence_id;
    bookingDto.vehicleId = dto.vehicleId || dto.vehicle_id || dto.voiture_id;

    if (dto.offerId || dto.offer_id) {
      bookingDto.offerId = dto.offerId || dto.offer_id;
    }

    // Compatibilité "package"
    if (!bookingDto.offerId && (dto.packageId || dto.package_id)) {
      bookingDto.offerId = dto.packageId || dto.package_id;
    }

    // Dates
    bookingDto.startDate = dto.startDate || dto.date_debut;
    bookingDto.endDate = dto.endDate || dto.date_fin;

    // Prix
    if (dto.totalPrice !== undefined || dto.prix_total !== undefined) {
      bookingDto.totalPrice = dto.totalPrice !== undefined ? dto.totalPrice : dto.prix_total;
    }

    // --- FIX : Gestion du paiement sans import Prisma problématique ---
    const paymentOption = dto.paymentOption || dto.option_paiement;
    if (paymentOption) {
      // On cast en unknown puis dans le type attendu par le DTO pour bypass l'erreur d'import
      (bookingDto as any).paymentOption = paymentOption;
    }

    // Montant d'acompte
    const downPaymentAmount = dto.downPaymentAmount ?? dto.montant_acompte;
    if (downPaymentAmount !== undefined) {
      bookingDto.downPaymentAmount = downPaymentAmount;
    }

    // Méthode de paiement
    if (dto.paymentMethod || dto.methode_paiement) {
      bookingDto.paymentMethod = (dto.paymentMethod || dto.methode_paiement) as any;
    }

    // Notes
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

  @Post('packages')
  @ApiOperation({ summary: 'Créer une réservation de package (alias offre combinée)' })
  createPackageBooking(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une réservation (générique)' })
  create(@Body() createReservationDto: CreateReservationDto, @Request() req) {
    const createBookingDto = this.transformReservationToBooking(createReservationDto);
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir toutes les réservations' })
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get('my-reservations')
  @ApiOperation({ summary: 'Obtenir mes réservations' })
  findMyReservations(@Request() req) {
    return this.bookingsService.findByUser(req.user.id);
  }

  @Get('my-properties-reservations')
  @ApiOperation({ summary: 'Obtenir les réservations de mes propriétés' })
  findMyPropertiesReservations(@Request() req) {
    return this.bookingsService.findByOwner(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une réservation par ID' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une réservation' })
  update(@Param('id') id: string, @Body() updateBookingDto: UpdateBookingDto) {
    return this.bookingsService.update(id, updateBookingDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une réservation' })
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }

  @Patch(':id/approve')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ summary: 'Approuver une réservation' })
  approve(@Param('id') id: string) {
    return this.bookingsService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ summary: 'Rejeter une réservation' })
  reject(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.bookingsService.reject(id, body?.reason);
  }

  @Patch(':id/confirm-key-retrieval')
  @ApiOperation({ summary: 'Confirmer la récupération de clé' })
  confirmKeyRetrieval(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmKeyRetrieval(id, req.user.id);
  }

  @Patch(':id/confirm-owner-key-handover')
  @UseGuards(BookingOwnerOrAdminGuard)
  @ApiOperation({ summary: 'Confirmer la remise de clé' })
  confirmOwnerKeyHandover(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmOwnerKeyHandover(id, req.user.id);
  }

  @Patch(':id/confirm-checkout')
  @ApiOperation({ summary: 'Confirmer le check-out' })
  confirmCheckOut(@Param('id') id: string, @Request() req) {
    return this.bookingsService.confirmCheckOut(id, req.user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Annuler une réservation (client)' })
  cancel(@Param('id') id: string, @Request() req) {
    return this.bookingsService.cancelByClient(id, req.user.id);
  }
}
