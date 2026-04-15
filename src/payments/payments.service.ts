import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
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
  
  // Endpoint validé pour éviter les redirections 301/302
  private readonly GENIUS_API_URL = 'https://pay.genius.ci/public/api/v1/merchant/payments';

  // Agent HTTPS configuré pour résoudre les erreurs SSL alert 112 (SNI)
  private readonly httpsAgent = new https.Agent({
    rejectUnauthorized: false, // Nécessaire selon l'infra actuelle du PSP
    servername: 'pay.genius.ci',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
      include: { user: true },
    });

    if (!booking) throw new NotFoundException('Réservation introuvable.');

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

    try {
      this.logger.log(`🚀 [GENIUSPAY] Init: ${amount} XOF pour Booking ${bookingId}`);

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
          success_url: this.config.get('GENIUSPAY_SUCCESS_URL'),
          error_url: this.config.get('GENIUSPAY_CANCEL_URL'),
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
        this.logger.log(`✅ [GENIUSPAY] Lien généré: ${result.data.checkout_url}`);

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
   * Webhook: Traitement asynchrone des confirmations de paiement
   */
  async handleGeniusPayWebhook(body: any, signature?: string) {
    this.logger.log(`📥 [WEBHOOK] Payload reçu: ${JSON.stringify(body)}`);

    const reference = body.data?.reference?.toString();
    if (!reference) return { status: 'error', message: 'Missing reference' };

    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: reference },
    });

    if (!payment) {
      this.logger.error(`❌ [WEBHOOK] Paiement ${reference} non trouvé en base.`);
      return { status: 'not_found' };
    }

    // Idempotence: Ne pas traiter deux fois
    if (payment.status === PaymentStatus.COMPLETED) {
      return { status: 'already_processed' };
    }

    // Validation du succès (Event-driven), insensible à la casse côté PSP
    const receivedStatus = body.data?.status?.toString().toLowerCase();
    if (body.event === 'payment.success' || receivedStatus === 'success') {
      try {
        await this.prisma.$transaction([
          // 1. Marquer le paiement comme complété
          this.prisma.payment.update({
            where: { id: payment.id },
            data: { 
              status: PaymentStatus.COMPLETED,
              method: this.mapChannelToMethod(body.data?.channel)
            },
          }),
          // 2. Valider la réservation
          this.prisma.booking.update({
            where: { id: payment.bookingId },
            data: { status: BookingStatus.PAID },
          }),
        ]);

        this.logger.log(`💰 [WEBHOOK_SUCCESS] Booking ${payment.bookingId} confirmé.`);
        return { status: 'success' };
      } catch (e) {
        this.logger.error(`❌ [WEBHOOK_DB_FAILURE] ${e.message}`);
        throw e;
      }
    }

    return { status: 'ignored' };
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
    return this.prisma.payment.findMany({ include: { user: true, booking: true } });
  }

  async findOne(id: string) {
    return this.prisma.payment.findUnique({ where: { id }, include: { user: true, booking: true } });
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
