import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { safeAdminUserSelect } from '../common/prisma/safe-selects';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import axios from 'axios';
import * as https from 'https';

/**
 * PaymentsService - Expert Fullstack Implementation
 * Mission: Secure & High-Performance Payment Gateway Management
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly DEPOSIT_PERCENTAGE = 0.3;
  private readonly MIN_AMOUNT_XOF = 200;
  
  private readonly GENIUS_API_URL: string;

  private readonly httpsAgent = new https.Agent({
    rejectUnauthorized: true,
    servername: 'pay.genius.ci',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.GENIUS_API_URL = this.config.get<string>('GENIUSPAY_API_URL');
    this.logger.log(`URL GeniusPay utilisée : ${this.GENIUS_API_URL}`);
  }

  /**
   * Initialise un tunnel de paiement GeniusPay
   * @param bookingId - Reference de la réservation
   * @param userId - ID de l'initiateur
   */
  async initializeGeniusPayPayment(
    bookingId: string,
    userId: string,
    paymentType?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!booking) throw new NotFoundException('Réservation introuvable.');
    if (booking.userId !== userId) throw new ForbiddenException('Vous ne pouvez payer que vos propres réservations.');

    // On réutilise en priorité le paiement PENDING déjà calculé (acompte vs total).
    const pendingPayment = await this.prisma.payment.findFirst({
      where: {
        bookingId,
        userId,
        status: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    const type = paymentType?.toUpperCase() || 'FULL';
    const requestedAmount =
      type === 'DEPOSIT'
        ? Math.ceil(booking.totalPrice * this.DEPOSIT_PERCENTAGE)
        : Math.ceil(booking.totalPrice);
    // Si un type est explicitement demandé, il prime.
    // Sinon on peut réutiliser le dernier PENDING pour éviter les écarts côté client.
    const calculatedAmount = paymentType ? requestedAmount : pendingPayment?.amount ?? requestedAmount;
    const amount = Math.max(Math.round(calculatedAmount), this.MIN_AMOUNT_XOF);
    const baseAmount = Math.ceil(booking.totalPrice);
    const fees = Math.max(Math.round(amount - baseAmount), 0);

    if (type === 'DEPOSIT') {
      this.logger.log(
        `💰 [ACOMPTE 30%] Calcul : ${amount} XOF (Total: ${booking.totalPrice}) (booking ${bookingId})`,
      );
    } else {
      this.logger.log(`💳 [TOTAL] Paiement complet : ${amount} XOF (booking ${bookingId})`);
    }

    const apiKey = this.config.get<string>('GENIUSPAY_API_KEY');
    const apiSecret = this.config.get<string>('GENIUSPAY_API_SECRET');
    const successUrlBase = this.config.get<string>('GENIUSPAY_SUCCESS_URL');
    const cancelUrlBase = this.config.get<string>('GENIUSPAY_CANCEL_URL');

    const appendBookingId = (url?: string) => {
      if (!url) return url;
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}bookingId=${booking.id}`;
    };

    try {
      // Initialisation du paiement GeniusPay

      const response = await axios.post(
        this.GENIUS_API_URL,
        {
          amount: amount,
          currency: 'XOF',
          description: `DodoVroum - Réservation #${booking.id.slice(0, 8).toUpperCase()}`,
          customer: {
            name: `${booking.user.firstName || ''} ${booking.user.lastName || ''}`.trim() || 'Client DodoVroum',
            email: booking.user.email,
          },
          success_url: appendBookingId(successUrlBase),
          error_url: appendBookingId(cancelUrlBase),
          // GeniusPay webhook callback URL (utilisée pour envoyer les statuts de paiement)
          webhook_url: 'https://api.dodovroum.com/api/payments/geniuspay',
        },
        {
          headers: {
            'X-API-Key': apiKey,
            'X-API-Secret': apiSecret,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          httpsAgent: this.httpsAgent,
          timeout: 45000, // Timeout allongé pour stabilité mobile
        },
      );

      const result = response.data;

      if (result.success && result.data) {
        // Lien de redirection renvoyé par GeniusPay

        const reference = result.data.reference.toString();

        // Persistance de la tentative de paiement :
        // - met à jour le paiement PENDING existant s'il existe (évite les doublons)
        // - sinon crée une nouvelle tentative
        const payment = pendingPayment
          ? await this.prisma.payment.update({
              where: { id: pendingPayment.id },
              data: {
                amount,
                baseAmount,
                fees,
                currency: 'XOF',
                status: PaymentStatus.PENDING,
                method: PaymentMethod.CARD, // Sera mis à jour par le webhook selon le channel réel
                transactionId: reference,
              },
            })
          : await this.prisma.payment.create({
              data: {
                amount,
                baseAmount,
                fees,
                currency: 'XOF',
                status: PaymentStatus.PENDING,
                method: PaymentMethod.CARD, // Sera mis à jour par le webhook selon le channel réel
                userId: booking.userId,
                bookingId: booking.id,
                transactionId: reference,
              },
            });

        return {
          checkoutUrl: result.data.checkout_url,
          paymentId: payment.id,
        };
      }

      throw new Error(result.message || 'Réponse invalide du PSP');
    } catch (error: any) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`❌ [GENIUSPAY_ERROR] ${detail}`);
      throw new BadGatewayException(`Initialisation échouée: ${detail}`);
    }
  }

  /**
   * Confirmation GeniusPay : valide et confirme un paiement après vérification HMAC.
   * @param reference    - transactionId GeniusPay, ID Prisma, ou bookingId (fallback).
   * @param webhookAmount - Montant rapporté par GeniusPay — comparé au montant stocké.
   * @param channel      - Canal de paiement (card, momo…) pour mapper PaymentMethod.
   */
  async validatePayment(
    reference: string,
    webhookAmount: number | undefined,
    channel?: string,
  ): Promise<
    | { status: 'success' }
    | { status: 'not_found' }
    | { status: 'already_processed' }
    | { status: 'amount_mismatch' }
  > {
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { transactionId: reference },
          { id: reference },
          { bookingId: reference },
        ],
      },
      include: { booking: true },
    });

    if (!payment) {
      this.logger.warn(`[WEBHOOK] Référence inconnue (ref=${reference})`);
      return { status: 'not_found' };
    }

    // Fast path: already confirmed (idempotence via webhookEventId unique constraint)
    if (payment.webhookEventId !== null || payment.status === PaymentStatus.COMPLETED) {
      this.logger.log(`[WEBHOOK] Déjà traité (ref=${reference}, bookingId=${payment.bookingId})`);
      return { status: 'already_processed' };
    }

    // Amount validation — never trust the payload amount over what we stored
    if (webhookAmount !== undefined && !isNaN(webhookAmount)) {
      const diff = Math.abs(webhookAmount - payment.amount);
      if (diff > 1) {
        this.logger.warn(
          `[WEBHOOK_AMOUNT_MISMATCH] ref=${reference} bookingId=${payment.bookingId} ` +
          `expected=${payment.amount} received=${webhookAmount}`,
        );
        return { status: 'amount_mismatch' };
      }
    }

    // Booking must not already be paid
    if (
      payment.booking.status === BookingStatus.PAID ||
      payment.booking.status === BookingStatus.CONFIRMED
    ) {
      this.logger.log(`[WEBHOOK] Booking déjà confirmé (bookingId=${payment.bookingId})`);
      return { status: 'already_processed' };
    }

    try {
      // Atomic update: only succeeds if the payment is still PENDING and has no webhookEventId.
      // This prevents concurrent duplicate webhook deliveries from double-processing.
      const atomicUpdate = await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
          webhookEventId: null,
        },
        data: {
          status: PaymentStatus.COMPLETED,
          method: this.mapChannelToMethod(channel),
          webhookEventId: reference,
        },
      });

      if (atomicUpdate.count === 0) {
        // Another concurrent request already processed this webhook
        return { status: 'already_processed' };
      }

      await this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: BookingStatus.PAID },
      });

      this.logger.log(
        `[WEBHOOK_SUCCESS] event=payment.success bookingId=${payment.bookingId} status=PAID`,
      );
      return { status: 'success' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[WEBHOOK_DB_FAILURE] ${msg}`);
      throw e;
    }
  }

  /**
   * Mapping des canaux de paiement GeniusPay vers ton Enum Prisma
   */
  private mapChannelToMethod(channel: string): PaymentMethod {
    const c = channel?.toLowerCase();
    if (c?.includes('card')) return PaymentMethod.CARD;
    if (c?.includes('momo') || c?.includes('money')) return PaymentMethod.MOBILE_MONEY;
    return PaymentMethod.CARD;
  }

  // --- Standard CRUD Methods ---

  async findByUser(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: { booking: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findAll() {
    return this.prisma.payment.findMany({
      include: { user: { select: safeAdminUserSelect }, booking: true },
    });
  }

  async findOne(id: string, requestingUserId: string, requestingRole: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { user: { select: safeAdminUserSelect }, booking: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    if (requestingRole !== 'ADMIN' && payment.userId !== requestingUserId) {
      throw new ForbiddenException('Accès refusé.');
    }
    return payment;
  }

  async update(id: string, dto: UpdatePaymentDto) {
    return this.prisma.payment.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    return this.prisma.payment.delete({ where: { id } });
  }

  async create(dto: CreatePaymentDto, userId: string) {
    return this.prisma.payment.create({ data: { ...dto, userId } as any });
  }

  async checkPaymentStatus(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const isPaid =
      booking.status === BookingStatus.PAID ||
      booking.status === BookingStatus.CONFIRMED;

    return {
      bookingId: booking.id,
      status: booking.status,
      paid: isPaid,
    };
  }
}
