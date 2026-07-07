import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService, PrismaTxClient } from '../common/prisma/prisma.service';
import { safeBookingUserSelect, safeResidenceSelect, safeVehicleSelect } from '../common/prisma/safe-selects';
import { BookingValidationService } from './services/booking-validation.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateBookingDatesDto } from './dto/update-booking-dates.dto';
import { Prisma, NotificationType, PaymentStatus, PaymentMethod, BookingStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { FirebaseService } from '../notifications/firebase.service';

/**
 * @class BookingsService
 * @description Expert Fullstack - Gestion des réservations, synchronisation Dashboard (Laravel) et App (Flutter)
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private bookingValidationService: BookingValidationService,
    private notificationsService: NotificationsService,
    private firebaseService: FirebaseService,
  ) {}

  // --- MÉTHODES DE CRÉATION ET MISE À JOUR ---

  async create(createBookingDto: CreateBookingDto, userId: string) {
    await this.bookingValidationService.validateBooking(createBookingDto);

    const { paymentOption, downPaymentAmount, paymentMethod, ...bookingPayload } = createBookingDto;

    const startDate = new Date(bookingPayload.startDate);
    const endDate = new Date(bookingPayload.endDate);

    await this.internalCheckAvailability(
      bookingPayload.residenceId,
      bookingPayload.vehicleId,
      bookingPayload.offerId,
      startDate,
      endDate,
    );

    const totalPrice = await this.bookingValidationService.calculateTotalPrice(
      bookingPayload.residenceId,
      bookingPayload.vehicleId,
      bookingPayload.offerId,
      bookingPayload.startDate,
      bookingPayload.endDate,
    );

    const normalizedPaymentOption = (paymentOption || 'FULL_PAYMENT') as 'DOWN_PAYMENT' | 'FULL_PAYMENT';
    const amountToCharge = normalizedPaymentOption === 'DOWN_PAYMENT' ? downPaymentAmount : totalPrice;

    const { status: _ignoredStatus, ...bookingData } = bookingPayload;

    const overlapDto = {
      ...createBookingDto,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    // Dispatcher : offre combinée vs réservation simple
    if (createBookingDto.offerId) {
      return this.createPackageReservation({
        bookingData,
        userId,
        totalPrice,
        amountToCharge,
        startDate,
        endDate,
        paymentMethod,
        overlapDto,
        offerId: createBookingDto.offerId,
      });
    }

    // Réservation simple (résidence ou véhicule seul)
    const booking = await this.prisma.$transaction(
      async (tx) => {
        await this.bookingValidationService.assertNoBlockingOverlapTx(tx, overlapDto);

        const newBooking = await tx.booking.create({
          data: {
            ...bookingData,
            userId,
            totalPrice,
            startDate,
            endDate,
            status: BookingStatus.AWAITING_PAYMENT,
          } as Prisma.BookingUncheckedCreateInput,
        });

        await tx.payment.create({
          data: {
            amount: amountToCharge,
            currency: 'XOF',
            status: PaymentStatus.PENDING,
            method: paymentMethod || PaymentMethod.CARD,
            userId,
            bookingId: newBooking.id,
          },
        });

        return newBooking;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    const fullBooking = await this.findOneRaw(booking.id);
    await this.sendBookingNotification(fullBooking, userId, 'CREATED');
    return this.formatBookingResponse(fullBooking);
  }

  /**
   * Crée une réservation d'offre combinée (package résidence + véhicule) et
   * bloque immédiatement les deux assets dans la même transaction sérialisable.
   *
   * Flux dans la transaction :
   *  1. assertNoBlockingOverlapTx  — verrou anti-doublon sérialisable
   *  2. booking.create             — réservation principale
   *  3. payment.create             — paiement associé
   *  4. blockedDate.create ×2      — résidence + véhicule de l'offre
   *
   * Les BlockedDate sont liés au booking via bookingId (onDelete: Cascade),
   * ce qui garantit leur suppression automatique si le booking est hard-deleted.
   * Pour les annulations (status change), voir releasePackageBlockedDates().
   */
  private async createPackageReservation(params: {
    bookingData: any;
    userId: string;
    totalPrice: number;
    amountToCharge: number;
    startDate: Date;
    endDate: Date;
    paymentMethod: any;
    overlapDto: CreateBookingDto;
    offerId: string;
  }) {
    const { bookingData, userId, totalPrice, amountToCharge, startDate, endDate, paymentMethod, overlapDto, offerId } = params;

    // Lecture de l'offre avant la transaction (évite une requête imbriquée dans la tx)
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { residenceId: true, vehicleId: true },
    });

    if (!offer) {
      throw new BadRequestException('Offre non trouvée');
    }

    const booking = await this.prisma.$transaction(
      async (tx) => {
        // Verrou sérialisable : empêche les réservations concurrentes sur les mêmes dates
        await this.bookingValidationService.assertNoBlockingOverlapTx(tx, overlapDto);

        // 1. Créer la réservation package
        const newBooking = await tx.booking.create({
          data: {
            ...bookingData,
            userId,
            totalPrice,
            startDate,
            endDate,
            status: BookingStatus.AWAITING_PAYMENT,
          } as Prisma.BookingUncheckedCreateInput,
        });

        // 2. Créer le paiement
        await tx.payment.create({
          data: {
            amount: amountToCharge,
            currency: 'XOF',
            status: PaymentStatus.PENDING,
            method: paymentMethod || PaymentMethod.CARD,
            userId,
            bookingId: newBooking.id,
          },
        });

        // 3. Bloquer la résidence de l'offre
        await tx.blockedDate.create({
          data: {
            residenceId: offer.residenceId,
            startDate,
            endDate,
            bookingId: newBooking.id,
            reason: 'RESERVATION',
          },
        });

        // 4. Bloquer le véhicule de l'offre
        await tx.blockedDate.create({
          data: {
            vehicleId: offer.vehicleId,
            startDate,
            endDate,
            bookingId: newBooking.id,
            reason: 'RESERVATION',
          },
        });

        return newBooking;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    const fullBooking = await this.findOneRaw(booking.id);
    await this.sendBookingNotification(fullBooking, userId, 'CREATED');
    return this.formatBookingResponse(fullBooking);
  }

  /**
   * Libère les BlockedDate créés par createPackageReservation().
   * À appeler dans toute transition vers CANCELLED ou EXPIRED.
   * (Le hard-delete via remove() est couvert par onDelete: Cascade.)
   */
  private async releasePackageBlockedDates(
    tx: PrismaTxClient,
    bookingId: string,
  ): Promise<void> {
    await tx.blockedDate.deleteMany({ where: { bookingId } });
  }

  /**
   * Verrou court (~15 min) sur les créneaux avec paiement PENDING + conflits PAID / confirmés, etc.
   */
  private async internalCheckAvailability(
    residenceId: string | undefined | null,
    vehicleId: string | undefined | null,
    offerId: string | undefined | null,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    await this.bookingValidationService.assertNoBlockingOverlapBeforeCreate({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      residenceId: residenceId ?? undefined,
      vehicleId: vehicleId ?? undefined,
      offerId: offerId ?? undefined,
    } as CreateBookingDto);
  }

  private readonly rescheduleBlockedStatuses: BookingStatus[] = [
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
    BookingStatus.COMPLETED,
    BookingStatus.TERMINEE,
    BookingStatus.EN_COURS_SEJOUR,
    BookingStatus.ONGOING,
  ];

  private assertRescheduleAllowed(booking: { status: BookingStatus; keyRetrievedAt: Date | null }) {
    if (booking.keyRetrievedAt) {
      throw new BadRequestException('La clé a déjà été récupérée : report impossible.');
    }
    if (this.rescheduleBlockedStatuses.includes(booking.status)) {
      throw new BadRequestException('Cette réservation ne peut plus être reportée (statut actuel).');
    }
  }

  /**
   * Report ou modification des dates : disponibilité, statut, recalcul du totalPrice.
   */
  async updateBookingDates(id: string, dto: UpdateBookingDatesDto, requestingUserId?: string, requestingRole?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');

    if (requestingUserId && requestingRole !== 'ADMIN' && booking.userId !== requestingUserId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres réservations.');
    }

    this.assertRescheduleAllowed(booking);

    await this.bookingValidationService.validateRescheduleDates(
      {
        id: booking.id,
        residenceId: booking.residenceId,
        vehicleId: booking.vehicleId,
        offerId: booking.offerId,
      },
      dto.startDate,
      dto.endDate,
    );

    const totalPrice = await this.bookingValidationService.calculateTotalPrice(
      booking.residenceId ?? undefined,
      booking.vehicleId ?? undefined,
      booking.offerId ?? undefined,
      dto.startDate,
      dto.endDate,
    );

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        totalPrice,
      },
      include: this.getBookingInclude(),
    });

    return this.formatBookingResponse(updated);
  }

  async update(id: string, updateBookingDto: UpdateBookingDto, requestingUserId: string, requestingRole: string) {
    const existing = await this.prisma.booking.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundException('Réservation non trouvée');
    if (requestingRole !== 'ADMIN' && existing.userId !== requestingUserId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres réservations.');
    }

    const { startDate, endDate, ...rest } = updateBookingDto;
    const hasStart = startDate !== undefined;
    const hasEnd = endDate !== undefined;

    if (hasStart !== hasEnd) {
      throw new BadRequestException('Pour modifier les dates, fournissez startDate et endDate ensemble.');
    }

    const hasRest = Object.entries(rest).some(([, v]) => v !== undefined);

    if (!hasStart && !hasEnd && !hasRest) {
      throw new BadRequestException('Aucun champ à mettre à jour.');
    }

    if (hasStart && hasEnd) {
      if (!hasRest) {
        return this.updateBookingDates(id, { startDate: startDate!, endDate: endDate! });
      }
      await this.updateBookingDates(id, { startDate: startDate!, endDate: endDate! });
    }

    if (hasRest) {
      const patchBody =
        hasStart && hasEnd
          ? (() => {
              const { totalPrice: _ignored, ...withoutPrice } = rest as UpdateBookingDto & {
                totalPrice?: number;
              };
              return withoutPrice;
            })()
          : rest;

      const {
        paymentOption: _paymentOption,
        downPaymentAmount: _downPaymentAmount,
        paymentMethod: _paymentMethod,
        ...bookingScalars
      } = patchBody as UpdateBookingDto;

      const hasPatchFields = Object.entries(bookingScalars).some(([, v]) => v !== undefined);
      if (!hasPatchFields) {
        return this.formatBookingResponse(await this.findOneRaw(id));
      }

      const data: Prisma.BookingUpdateInput = {
        ...bookingScalars,
      } as Prisma.BookingUpdateInput;

      const updated = await this.prisma.booking.update({
        where: { id },
        data,
        include: this.getBookingInclude(),
      });

      return this.formatBookingResponse(updated);
    }
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { bookingId: id } });
      await tx.review.deleteMany({ where: { bookingId: id } });
      return tx.booking.delete({ where: { id } });
    });
  }

  // --- ACTIONS DU WORKFLOW (Approbation / Rejet / Check-in) ---

  async cancelByClient(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.userId !== userId) throw new BadRequestException('Action interdite.');
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.AWAITING_PAYMENT) {
      throw new BadRequestException('Seule une réservation en attente peut être annulée.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Libérer les dates bloquées (package) avant le changement de statut
      await this.releasePackageBlockedDates(tx, id);
      return tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED },
        include: this.getBookingInclude(),
      });
    });

    await this.sendBookingNotification(updated, userId, 'REJECTED', 'Annulée par le client');
    return this.formatBookingResponse(updated);
  }

  async approve(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { status: true, userId: true } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.PAID) {
      throw new BadRequestException(`Impossible d'approuver une réservation en statut ${booking.status}.`);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED, ownerConfirmedAt: new Date() },
      include: this.getBookingInclude(),
    });
    await this.sendBookingNotification(updated, updated.userId, 'APPROVED');
    return this.formatBookingResponse(updated);
  }

  async reject(id: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { status: true, userId: true } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.PAID) {
      throw new BadRequestException(`Impossible de rejeter une réservation en statut ${booking.status}.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Libérer les dates bloquées (package) avant le changement de statut
      await this.releasePackageBlockedDates(tx, id);
      return tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED, notes: reason },
        include: this.getBookingInclude(),
      });
    });

    await this.sendBookingNotification(updated, updated.userId, 'REJECTED', reason);
    return this.formatBookingResponse(updated);
  }

  async updateStatus(id: string, status: BookingStatus) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');

    if (status === BookingStatus.CONFIRMED &&
        booking.status !== BookingStatus.PENDING &&
        booking.status !== BookingStatus.PAID) {
      throw new BadRequestException(`Impossible de confirmer une réservation en statut ${booking.status}.`);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status,
        ...(status === BookingStatus.CONFIRMED ? { ownerConfirmedAt: new Date() } : {}),
      },
      include: this.getBookingInclude(),
    });

    if (status === BookingStatus.CONFIRMED) {
      await this.sendBookingNotification(updated, updated.userId, 'APPROVED');
    }

    return this.formatBookingResponse(updated);
  }

  async confirmKeyRetrieval(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { status: true, userId: true } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');
    if (booking.userId !== userId) throw new ForbiddenException('Action non autorisée.');
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(`La récupération de clé nécessite une réservation CONFIRMÉE (statut actuel : ${booking.status}).`);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: 'EN_COURS_SEJOUR', keyRetrievedAt: new Date(), ownerConfirmedAt: new Date() },
      include: this.getBookingInclude(),
    });
    return this.formatBookingResponse(updated);
  }

  async confirmOwnerKeyHandover(id: string, ownerId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { status: true } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(`La remise de clé nécessite une réservation CONFIRMÉE (statut actuel : ${booking.status}).`);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: 'EN_COURS_SEJOUR', ownerConfirmedAt: new Date() },
      include: this.getBookingInclude(),
    });
    return this.formatBookingResponse(updated);
  }

  async confirmCheckOut(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, select: { status: true, userId: true } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');
    if (booking.userId !== userId) throw new ForbiddenException('Action non autorisée.');
    const checkoutAllowed = ['EN_COURS_SEJOUR', 'ONGOING', BookingStatus.ONGOING] as string[];
    if (!checkoutAllowed.includes(booking.status as string)) {
      throw new BadRequestException(`Le check-out nécessite une réservation en cours (statut actuel : ${booking.status}).`);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.COMPLETED, checkOutAt: new Date() },
      include: this.getBookingInclude(),
    });
    return this.formatBookingResponse(updated);
  }

  // --- MÉTHODES DE LECTURE ---

  async findAll() {
    const bookings = await this.prisma.booking.findMany({
      include: this.getBookingInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(b => this.formatBookingResponse(b));
  }

  async findOne(id: string, requestingUserId: string, requestingRole: string) {
    const booking = await this.findOneRaw(id);
    if (!booking) throw new NotFoundException('Réservation non trouvée');

    if (requestingRole !== 'ADMIN') {
      // Allow: booking client OR property owner (residence / vehicle / offer)
      const hasAccess = await this.prisma.booking.findFirst({
        where: {
          id,
          OR: [
            { userId: requestingUserId },
            { residence: { ownerId: requestingUserId } },
            { vehicle:   { ownerId: requestingUserId } },
            { offer:     { ownerId: requestingUserId } },
          ],
        },
        select: { id: true },
      });
      if (!hasAccess) throw new BadRequestException('Accès refusé');
    }

    return this.formatBookingResponse(booking);
  }

  async findByUser(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: this.getBookingInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(b => this.formatBookingResponse(b));
  }

  async findByOwner(ownerId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { residence: { ownerId } },
          { vehicle: { ownerId } },
          { offer: { ownerId } },
        ],
      },
      include: this.getBookingInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(b => this.formatBookingResponse(b));
  }

  // --- HELPERS ET MAPPING DE RÉPONSE ---

  private async findOneRaw(id: string) {
    return this.prisma.booking.findUnique({
      where: { id },
      include: this.getBookingInclude(),
    });
  }

  private getBookingInclude() {
    return {
      user: { select: safeBookingUserSelect },
      residence: { select: safeResidenceSelect },
      vehicle: { select: safeVehicleSelect },
      offer: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          residence: { select: safeResidenceSelect },
        },
      },
      payments: true,
      reviews: { select: { id: true } },
    };
  }

  private getFirstImage(imagesData: any): string | null {
    if (!imagesData) return null;
    if (Array.isArray(imagesData)) return imagesData.length > 0 ? imagesData[0] : null;
    if (typeof imagesData === 'string') {
      try {
        const parsed = JSON.parse(imagesData);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
      } catch {
        return imagesData.split(',')[0].trim();
      }
    }
    return null;
  }

private formatBookingResponse(booking: any) {
    const statusMap: Record<string, string> = {
      'PENDING': 'pending',
      'AWAITING_PAYMENT': 'awaitingPayment',
      'PAID': 'paid',
      'CONFIRMEE': 'confirmee',
      'EN_COURS_SEJOUR': 'enCoursSejour',
      'COMPLETED': 'terminee',
      'CANCELLED': 'cancelled',
      'EXPIRED': 'expired',
    };

    const payments = booking.payments || [];
    const totalPaid = payments
      .filter((p: any) => p.status === 'COMPLETED')
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    // Après paiement réussi (PAID), la réservation est en attente d'action propriétaire.
    const normalizedStatus =
      typeof booking.status === 'string' ? booking.status.toUpperCase() : booking.status;

    const isPendingApproval =
      (normalizedStatus === BookingStatus.PENDING ||
        normalizedStatus === BookingStatus.PAID ||
        normalizedStatus === 'ENATTENTE') &&
      !booking.ownerConfirmedAt;

    const isAwaitingPayment = normalizedStatus === BookingStatus.AWAITING_PAYMENT;

    // Résolution du propriétaire : résidence > véhicule > résidence de l'offre
    const owner =
      booking.residence?.owner ||
      booking.vehicle?.owner ||
      booking.offer?.residence?.owner ||
      null;
    const ownerName = owner
      ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || 'Propriétaire indisponible'
      : 'Propriétaire indisponible';
    const ownerPhone = owner?.phone ?? null;
    const ownerId =
      owner?.id ??
      booking.residence?.ownerId ??
      booking.vehicle?.ownerId ??
      null;

    return {
      id: booking.id,
      residence: booking.residence ? {
        id: booking.residence.id,
        nom: booking.residence.title,
        proprietaireId: booking.residence.ownerId,
        imageUrl: this.getFirstImage(booking.residence.images),
      } : null,
      vehicle: booking.vehicle ? {
        id: booking.vehicle.id,
        titre: `${booking.vehicle.brand} ${booking.vehicle.model}`,
        // Tolère plusieurs variantes de schéma/legacy (`pricePerDay` ou `price`)
        pricePerDay: booking.vehicle.pricePerDay || booking.vehicle.price || 0,
        proprietaireId: booking.vehicle.ownerId,
        imageUrl: this.getFirstImage(booking.vehicle.images),
      } : null,
      offer: booking.offer ? {
        id: booking.offer.id,
        titre: booking.offer.title,
        imageUrl: booking.offer.imageUrl || this.getFirstImage(booking.offer.residence?.images),
      } : null,
      residenceImage: booking.offer?.imageUrl || this.getFirstImage(booking.residence?.images) || this.getFirstImage(booking.vehicle?.images),
      totalPrice: booking.totalPrice,
      totalPaid,
      status: statusMap[booking.status] || booking.status.toLowerCase(),
      
      // --- CHAMPS DE SUIVI POUR LE STEPPER ---
      keyRetrievedAt: booking.keyRetrievedAt,
      checkOutAt: booking.checkOutAt,
      ownerConfirmedAt: booking.ownerConfirmedAt,
      isConfirmed: !!booking.ownerConfirmedAt,
      isPendingApproval: Boolean(isPendingApproval),
      isAwaitingPayment: Boolean(isAwaitingPayment),

      // --- INFOS TEMPORELLES ---
      checkInDate: booking.startDate,
      checkOutDate: booking.endDate,
      clientId: booking.userId,
      clientName: booking.user ? `${booking.user.firstName} ${booking.user.lastName}` : 'Client Inconnu',
      ownerName,
      ownerPhone,
      ownerId,
      createdAt: booking.createdAt
    };
  }

  private async sendBookingNotification(booking: any, userId: string, type: string, reason?: string) {
    try {
      const typeMap: Record<string, { title: string; msg: string }> = {
        CREATED:  { title: 'Nouvelle réservation',     msg: 'Votre demande est en attente de confirmation.' },
        APPROVED: { title: 'Réservation approuvée !',  msg: 'Le propriétaire a confirmé votre séjour.' },
        REJECTED: { title: 'Réservation refusée',      msg: reason ?? 'Votre demande n\'a pas pu être acceptée.' },
      };
      const meta = typeMap[type] ?? { title: 'Mise à jour', msg: 'Le statut de votre réservation a changé.' };

      await this.notificationsService.createNotification(
        userId,
        meta.title,
        meta.msg,
        type === 'REJECTED' ? NotificationType.ERROR : NotificationType.INFO,
        booking.id,
      );

      const bookingType: string = booking.vehicleId
        ? 'VEHICLE_BOOKING'
        : booking.residenceId
        ? 'RESIDENCE_BOOKING'
        : 'OFFER_BOOKING';

      await this.firebaseService.sendNotification(userId, {
        title: meta.title,
        body:  meta.msg,
        data:  { type: bookingType, bookingId: booking.id, event: type },
      });
    } catch (e: any) {
      this.logger.error(`[BookingsService] sendBookingNotification fail: ${e.message}`);
    }
  }
}
