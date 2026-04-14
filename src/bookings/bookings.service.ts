import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { BookingValidationService } from './services/booking-validation.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateBookingDatesDto } from './dto/update-booking-dates.dto';
import { Prisma, NotificationType, PaymentStatus, PaymentMethod, BookingStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * @class BookingsService
 * @description Expert Fullstack - Gestion des réservations, synchronisation Dashboard (Laravel) et App (Flutter)
 */
@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private bookingValidationService: BookingValidationService,
    private notificationsService: NotificationsService,
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

    const totalPrice =
      bookingPayload.totalPrice ??
      (await this.bookingValidationService.calculateTotalPrice(
        bookingPayload.residenceId,
        bookingPayload.vehicleId,
        bookingPayload.offerId,
        bookingPayload.startDate,
        bookingPayload.endDate,
      ));

    const normalizedPaymentOption = (paymentOption || 'FULL_PAYMENT') as 'DOWN_PAYMENT' | 'FULL_PAYMENT';
    const amountToCharge = normalizedPaymentOption === 'DOWN_PAYMENT' ? downPaymentAmount : totalPrice;

    const { status: _ignoredStatus, ...bookingData } = bookingPayload;

    const overlapDto = {
      ...createBookingDto,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

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
  async updateBookingDates(id: string, dto: UpdateBookingDatesDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Réservation non trouvée');

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

  async update(id: string, updateBookingDto: UpdateBookingDto) {
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
        return this.findOne(id);
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

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
      include: this.getBookingInclude(),
    });

    await this.sendBookingNotification(updated, userId, 'REJECTED', 'Annulée par le client');
    return this.formatBookingResponse(updated);
  }

  async approve(id: string) {
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CONFIRMED,
        ownerConfirmedAt: new Date() 
      },
      include: this.getBookingInclude(),
    });
    await this.sendBookingNotification(updated, updated.userId, 'APPROVED');
    return this.formatBookingResponse(updated);
  }

  async reject(id: string, reason?: string) {
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED, notes: reason },
      include: this.getBookingInclude(),
    });
    await this.sendBookingNotification(updated, updated.userId, 'REJECTED', reason);
    return this.formatBookingResponse(updated);
  }

  async confirmKeyRetrieval(id: string, userId: string) {
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'EN_COURS_SEJOUR',
        keyRetrievedAt: new Date(),
        ownerConfirmedAt: new Date()
      },
      include: this.getBookingInclude(),
    });
    return this.formatBookingResponse(updated);
  }

  async confirmOwnerKeyHandover(id: string, ownerId: string) {
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: 'EN_COURS_SEJOUR', ownerConfirmedAt: new Date() },
      include: this.getBookingInclude(),
    });
    return this.formatBookingResponse(updated);
  }

  async confirmCheckOut(id: string, userId: string) {
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

  async findOne(id: string) {
    const booking = await this.findOneRaw(id);
    if (!booking) throw new NotFoundException('Réservation non trouvée');
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
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      residence: true,
      vehicle: true,
      offer: { include: { residence: true, vehicle: true } },
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
    };

    const payments = booking.payments || [];
    const totalPaid = payments
      .filter((p: any) => p.status === 'COMPLETED')
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    const isPendingApproval =
      (booking.status === 'PENDING' || booking.status === 'enattente') &&
      !booking.ownerConfirmedAt;

    const isAwaitingPayment = booking.status === 'AWAITING_PAYMENT';

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
      residenceImage: this.getFirstImage(booking.residence?.images) || this.getFirstImage(booking.vehicle?.images),
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
      createdAt: booking.createdAt
    };
  }

  private async sendBookingNotification(booking: any, userId: string, type: string, reason?: string) {
    try {
      const typeMap: Record<string, {title: string, msg: string}> = {
        'CREATED': { title: 'Nouvelle réservation', msg: 'Votre demande est en attente de confirmation.' },
        'APPROVED': { title: 'Réservation approuvée ! ✅', msg: 'Le propriétaire a confirmé votre séjour.' },
        'REJECTED': { title: 'Réservation refusée', msg: reason || 'Votre demande n\'a pas pu être acceptée.' }
      };
      const meta = typeMap[type] || { title: 'Mise à jour', msg: 'Le statut de votre réservation a changé.' };

      await this.notificationsService.createNotification(
        userId,
        meta.title,
        meta.msg,
        type === 'REJECTED' ? NotificationType.ERROR : NotificationType.INFO,
        booking.id
      );
    } catch (e) {
      console.error('[BookingsService] Notify fail', e);
    }
  }
}
