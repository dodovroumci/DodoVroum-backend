import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { safeAdminUserSelect } from '../common/prisma/safe-selects';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import {
  BookingStatus,
  Payment,
  PaymentMethod,
  PaymentOption,
  PaymentStatus,
  Prisma,
  RefundReason,
} from '@prisma/client';
import axios from 'axios';
import * as https from 'https';

/** Réservation encore en attente de paiement. */
const PAYABLE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.AWAITING_PAYMENT, BookingStatus.PENDING];
/** Réservation qui ne peut plus être payée. */
const NOT_PAYABLE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.EXPIRED, BookingStatus.CANCELLED];

export type GeniusPayInitResult =
  | { checkoutUrl: string; paymentId: string; reused: boolean }
  | { status: 'already_paid'; bookingId: string; paid: true };

export interface GeniusPayWebhookMetadata {
  bookingId?: string;
  paymentId?: string;
}

type WebhookOutcome =
  | 'success'
  | 'refund_required'
  | 'not_found'
  | 'already_processed'
  | 'amount_mismatch'
  | 'metadata_mismatch';

/**
 * PaymentsService - Expert Fullstack Implementation
 * Mission: Secure & High-Performance Payment Gateway Management
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly DEPOSIT_PERCENTAGE = 0.3;
  private readonly MIN_AMOUNT_XOF = 200;
  /** Délai d'expiration backend d'une réservation non payée (BookingsProcessor). */
  private readonly UNPAID_BOOKING_LIFETIME_MS = 48 * 60 * 60 * 1000;
  /** Durée de vie documentée d'un checkout GeniusPay si `expires_at` est absent. */
  private readonly CHECKOUT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
  /** Un checkout n'est réutilisé que s'il reste valable au moins ce délai. */
  private readonly CHECKOUT_REUSE_MARGIN_MS = 2 * 60 * 1000;
  /** Verrou d'init considéré abandonné au-delà (> timeout HTTP GeniusPay de 45 s). */
  private readonly CHECKOUT_LOCK_TTL_MS = 60 * 1000;
  private readonly CHECKOUT_WAIT_TIMEOUT_MS = 20 * 1000;
  private readonly CHECKOUT_WAIT_INTERVAL_MS = 500;
  private readonly INIT_MAX_ATTEMPTS = 3;
  
  private readonly GENIUS_API_URL: string;

  private readonly httpsAgent = new https.Agent({
    rejectUnauthorized: true,
    keepAlive: false,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.GENIUS_API_URL = this.config.get<string>('GENIUSPAY_API_URL');
    this.logger.log(`URL GeniusPay utilisée : ${this.GENIUS_API_URL}`);
  }

  // ─── Initialisation GeniusPay ─────────────────────────────────────────────
  //
  // Règle : 1 Payment = au plus 1 session GeniusPay. Une référence
  // (transactionId) n'est jamais écrasée ; une session expirée est remplacée
  // par un nouveau Payment (même montant / même type), l'ancien passe FAILED
  // en gardant sa référence pour qu'un paiement tardif reste identifiable.

  /**
   * Initialise (ou reprend) le paiement GeniusPay d'une réservation.
   * @param paymentType - 'FULL' | 'DEPOSIT' : pris en compte uniquement pour la
   *   première session d'un Payment ; une reprise conserve montant et type.
   */
  async initializeGeniusPayPayment(
    bookingId: string,
    userId: string,
    paymentType?: string,
  ): Promise<GeniusPayInitResult> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!booking) throw new NotFoundException('Réservation introuvable.');
    if (booking.userId !== userId) throw new ForbiddenException('Vous ne pouvez payer que vos propres réservations.');

    if (this.isBookingExpiredOrCancelled(booking)) {
      throw new ConflictException('Cette réservation n\'est plus disponible au paiement.');
    }
    if (booking.status === BookingStatus.PAID || (await this.hasEffectivePayment(bookingId))) {
      return { status: 'already_paid', bookingId, paid: true };
    }
    if (!PAYABLE_BOOKING_STATUSES.includes(booking.status)) {
      // Ex. approuvée par le propriétaire sans paiement (ancien flux PENDING → CONFIRMED).
      throw new ConflictException('Cette réservation ne peut pas être payée en ligne dans son état actuel.');
    }

    const requestedOption = this.parsePaymentOption(paymentType);

    for (let attempt = 0; attempt < this.INIT_MAX_ATTEMPTS; attempt++) {
      const payment = await this.findOrCreatePendingPayment(booking, requestedOption);

      if (this.isCheckoutReusable(payment)) {
        return { checkoutUrl: payment.checkoutUrl!, paymentId: payment.id, reused: true };
      }

      if (payment.transactionId) {
        // Session expirée (ou antérieure au stockage du checkout) : remplacée,
        // jamais écrasée.
        await this.supersedeCheckoutSession(payment);
        continue;
      }

      if (await this.claimCheckoutCreation(payment.id)) {
        return this.createCheckoutSession(booking, payment, requestedOption);
      }

      // Un autre appel crée la session : on attend son résultat.
      const ready = await this.waitForConcurrentCheckout(payment.id);
      if (ready) {
        return { checkoutUrl: ready.checkoutUrl!, paymentId: ready.id, reused: true };
      }
    }

    throw new ConflictException('Initialisation du paiement en cours, réessayez dans quelques secondes.');
  }

  private isBookingExpiredOrCancelled(booking: {
    status: BookingStatus;
    createdAt: Date;
    ownerConfirmedAt: Date | null;
  }): boolean {
    if (NOT_PAYABLE_BOOKING_STATUSES.includes(booking.status)) return true;
    // Même règle que BookingsProcessor (cron horaire) : couvre son délai.
    return (
      PAYABLE_BOOKING_STATUSES.includes(booking.status) &&
      booking.ownerConfirmedAt === null &&
      this.now().getTime() - booking.createdAt.getTime() >= this.UNPAID_BOOKING_LIFETIME_MS
    );
  }

  /** Argent reçu et conservé (hors remboursements à traiter). */
  private async hasEffectivePayment(bookingId: string): Promise<boolean> {
    const paid = await this.prisma.payment.findFirst({
      where: { bookingId, status: PaymentStatus.COMPLETED, refundRequiredAt: null },
      select: { id: true },
    });
    return paid !== null;
  }

  private parsePaymentOption(paymentType?: string): PaymentOption | null {
    const t = paymentType?.trim().toUpperCase();
    if (!t) return null;
    return t === 'DEPOSIT' || t === 'DOWN_PAYMENT' ? PaymentOption.DOWN_PAYMENT : PaymentOption.FULL_PAYMENT;
  }

  private isCheckoutReusable(payment: Payment): boolean {
    return (
      payment.status === PaymentStatus.PENDING &&
      !!payment.transactionId &&
      !!payment.checkoutUrl &&
      !!payment.checkoutExpiresAt &&
      payment.checkoutExpiresAt.getTime() - this.now().getTime() > this.CHECKOUT_REUSE_MARGIN_MS
    );
  }

  /**
   * Payment PENDING courant de la réservation. Normalement créé avec la
   * réservation ; créé ici seulement pour les réservations qui n'en ont pas.
   */
  private async findOrCreatePendingPayment(
    booking: { id: string; userId: string; totalPrice: number },
    requestedOption: PaymentOption | null,
  ): Promise<Payment> {
    const findPending = () =>
      this.prisma.payment.findFirst({
        where: { bookingId: booking.id, status: PaymentStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });

    const existing = await findPending();
    if (existing) return existing;

    const option = requestedOption ?? PaymentOption.FULL_PAYMENT;
    const { amount, baseAmount, fees } = this.computeAmounts(booking.totalPrice, option);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const again = await tx.payment.findFirst({
            where: { bookingId: booking.id, status: PaymentStatus.PENDING },
            orderBy: { createdAt: 'desc' },
          });
          if (again) return again;
          return tx.payment.create({
            data: {
              amount,
              baseAmount,
              fees,
              paymentOption: option,
              currency: 'XOF',
              status: PaymentStatus.PENDING,
              method: PaymentMethod.CARD,
              userId: booking.userId,
              bookingId: booking.id,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      // Conflit de sérialisation : l'autre appel a créé le Payment.
      const created = await findPending();
      if (created) return created;
      throw e;
    }
  }

  private computeAmounts(totalPrice: number, option: PaymentOption) {
    const raw =
      option === PaymentOption.DOWN_PAYMENT
        ? Math.ceil(totalPrice * this.DEPOSIT_PERCENTAGE)
        : Math.ceil(totalPrice);
    const amount = Math.max(Math.round(raw), this.MIN_AMOUNT_XOF);
    const baseAmount = Math.ceil(totalPrice);
    const fees = Math.max(Math.round(amount - baseAmount), 0);
    return { amount, baseAmount, fees };
  }

  /**
   * Remplace une session inutilisable : l'ancien Payment passe FAILED (sa
   * référence est conservée) et un nouveau Payment reprend exactement le même
   * montant et le même type. Un seul appelant concurrent y parvient.
   */
  private async supersedeCheckoutSession(payment: Payment): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const retired = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING, transactionId: payment.transactionId },
        data: { status: PaymentStatus.FAILED, checkoutRequestedAt: null },
      });
      if (retired.count !== 1) return;
      await tx.payment.create({
        data: {
          amount: payment.amount,
          baseAmount: payment.baseAmount,
          fees: payment.fees,
          paymentOption: payment.paymentOption,
          currency: payment.currency,
          method: payment.method,
          status: PaymentStatus.PENDING,
          userId: payment.userId,
          bookingId: payment.bookingId,
        },
      });
    });
    this.logger.log(
      `[GENIUSPAY_SESSION_REPLACED] bookingId=${payment.bookingId} oldPaymentId=${payment.id} oldRef=${payment.transactionId}`,
    );
  }

  /** Verrou applicatif : `true` pour un seul appelant à la fois. */
  private async claimCheckoutCreation(paymentId: string): Promise<boolean> {
    const staleBefore = new Date(this.now().getTime() - this.CHECKOUT_LOCK_TTL_MS);
    const claimed = await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        status: PaymentStatus.PENDING,
        transactionId: null,
        OR: [{ checkoutRequestedAt: null }, { checkoutRequestedAt: { lt: staleBefore } }],
      },
      data: { checkoutRequestedAt: this.now() },
    });
    return claimed.count === 1;
  }

  /**
   * Attend la session créée par un appel concurrent. Renvoie null si le verrou
   * a été relâché sans session (échec) ou si l'attente expire : l'appelant
   * recommence alors la résolution.
   */
  private async waitForConcurrentCheckout(paymentId: string): Promise<Payment | null> {
    const polls = Math.ceil(this.CHECKOUT_WAIT_TIMEOUT_MS / this.CHECKOUT_WAIT_INTERVAL_MS);
    for (let i = 0; i < polls; i++) {
      await this.sleep(this.CHECKOUT_WAIT_INTERVAL_MS);
      const current = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      if (!current || current.status !== PaymentStatus.PENDING) return null;
      if (this.isCheckoutReusable(current)) return current;
      if (!current.transactionId && !current.checkoutRequestedAt) return null;
    }
    return null;
  }

  private async createCheckoutSession(
    booking: {
      id: string;
      totalPrice: number;
      user: { firstName: string | null; lastName: string | null; email: string };
    },
    payment: Payment,
    requestedOption: PaymentOption | null,
  ): Promise<GeniusPayInitResult> {
    // Première session de ce Payment : le choix explicite de l'utilisateur
    // s'applique ; sinon montant et type du Payment sont conservés tels quels.
    const recompute = requestedOption !== null && requestedOption !== payment.paymentOption;
    const option = requestedOption ?? payment.paymentOption;
    const { amount, baseAmount, fees } = recompute
      ? this.computeAmounts(booking.totalPrice, requestedOption!)
      : {
          amount: payment.amount,
          baseAmount: payment.baseAmount,
          fees: payment.fees,
        };

    const successUrlBase = this.config.get<string>('GENIUSPAY_SUCCESS_URL');
    const cancelUrlBase = this.config.get<string>('GENIUSPAY_CANCEL_URL');
    const appendBookingId = (url?: string) => {
      if (!url) return url;
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}bookingId=${booking.id}`;
    };

    this.logger.log(
      `💳 [GENIUSPAY_INIT] ${option ?? 'LEGACY'} ${amount} XOF (booking ${booking.id}, payment ${payment.id})`,
    );

    try {
      const response = await axios.post(
        this.GENIUS_API_URL,
        {
          amount,
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
          // Renvoyées telles quelles dans le webhook : contrôle croisé du rattachement.
          metadata: { bookingId: booking.id, paymentId: payment.id },
        },
        {
          headers: {
            'X-API-Key': this.config.get<string>('GENIUSPAY_API_KEY'),
            'X-API-Secret': this.config.get<string>('GENIUSPAY_API_SECRET'),
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          httpsAgent: this.httpsAgent,
          timeout: 45000, // Timeout allongé pour stabilité mobile
        },
      );

      const result = response.data;
      const reference = result?.data?.reference?.toString();
      const checkoutUrl: string | undefined = result?.data?.checkout_url ?? result?.data?.payment_url;
      if (!result?.success || !reference || !checkoutUrl) {
        throw new Error(result?.message || 'Réponse invalide du PSP');
      }

      const saved = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING, transactionId: null },
        data: {
          transactionId: reference,
          checkoutUrl,
          checkoutExpiresAt: this.parseCheckoutExpiry(result.data.expires_at),
          checkoutRequestedAt: null,
          amount,
          baseAmount,
          fees,
          paymentOption: option,
          currency: 'XOF',
        },
      });
      if (saved.count !== 1) {
        // Ne devrait pas arriver (verrou) : la session GeniusPay reste traçable
        // via metadata.paymentId si elle est payée.
        this.logger.error(
          `[GENIUSPAY_SESSION_ORPHAN] bookingId=${booking.id} paymentId=${payment.id} ref=${reference}`,
        );
        throw new ConflictException('Initialisation du paiement en cours, réessayez dans quelques secondes.');
      }

      return { checkoutUrl, paymentId: payment.id, reused: false };
    } catch (error: any) {
      // Relâche le verrou pour permettre une nouvelle tentative.
      await this.prisma.payment
        .updateMany({
          where: { id: payment.id, transactionId: null },
          data: { checkoutRequestedAt: null },
        })
        .catch(() => undefined);
      if (error instanceof HttpException) throw error;
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`❌ [GENIUSPAY_ERROR] ${detail}`);
      throw new BadGatewayException(`Initialisation échouée: ${detail}`);
    }
  }

  /** `expires_at` GeniusPay ; à défaut, durée documentée de 24 h. */
  private parseCheckoutExpiry(raw: unknown): Date {
    const parsed = typeof raw === 'string' ? new Date(raw) : null;
    if (parsed && !isNaN(parsed.getTime())) return parsed;
    return new Date(this.now().getTime() + this.CHECKOUT_DEFAULT_TTL_MS);
  }

  protected now(): Date {
    return new Date();
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Webhook GeniusPay ────────────────────────────────────────────────────

  /**
   * Confirmation GeniusPay (appelée après vérification HMAC + IP).
   *
   * Le Payment est retrouvé par sa référence (y compris une ancienne session
   * remplacée), ou à défaut par `metadata.paymentId` + `metadata.bookingId`
   * concordants. Il passe COMPLETED dès que le montant correspond : l'argent
   * reçu est toujours tracé. La réservation ne passe PAID que si elle est
   * encore payable ; sinon le Payment est marqué à rembourser.
   *
   * @param reference     - transactionId GeniusPay.
   * @param webhookAmount - Montant rapporté par GeniusPay — comparé au montant stocké.
   * @param channel       - Canal de paiement (card, momo…) pour mapper PaymentMethod.
   * @param metadata      - Métadonnées envoyées à l'init, renvoyées par GeniusPay.
   */
  async validatePayment(
    reference: string,
    webhookAmount: number | undefined,
    channel?: string,
    metadata?: GeniusPayWebhookMetadata,
  ): Promise<{ status: WebhookOutcome }> {
    const payment = await this.findWebhookPayment(reference, metadata);
    if (!payment) {
      this.logger.warn(
        `[WEBHOOK] Paiement introuvable (ref=${reference}, metadata.paymentId=${metadata?.paymentId ?? '-'})`,
      );
      return { status: 'not_found' };
    }

    if (
      (metadata?.bookingId && metadata.bookingId !== payment.bookingId) ||
      (metadata?.paymentId && metadata.paymentId !== payment.id)
    ) {
      this.logger.warn(
        `[WEBHOOK_METADATA_MISMATCH] ref=${reference} paymentId=${payment.id} bookingId=${payment.bookingId} ` +
          `metadata=${JSON.stringify(metadata)}`,
      );
      return { status: 'metadata_mismatch' };
    }

    // Idempotence : déjà traité (ou remboursé).
    if (
      payment.webhookEventId !== null ||
      payment.status === PaymentStatus.COMPLETED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
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

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        // Atomique : un seul traitement même si GeniusPay livre plusieurs fois.
        // FAILED = ancienne session remplacée mais payée malgré tout.
        const completed = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
            webhookEventId: null,
          },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: this.now(),
            method: this.mapChannelToMethod(channel),
            webhookEventId: reference,
            checkoutRequestedAt: null,
          },
        });
        if (completed.count === 0) return { status: 'already_processed' as const };

        const booking = await tx.booking.findUnique({
          where: { id: payment.bookingId },
          select: { status: true },
        });
        const otherPayment = await tx.payment.findFirst({
          where: {
            bookingId: payment.bookingId,
            id: { not: payment.id },
            status: PaymentStatus.COMPLETED,
            refundRequiredAt: null,
          },
          select: { id: true },
        });

        let refundReason: RefundReason | null = null;
        if (booking && PAYABLE_BOOKING_STATUSES.includes(booking.status) && !otherPayment) {
          const paid = await tx.booking.updateMany({
            where: { id: payment.bookingId, status: { in: PAYABLE_BOOKING_STATUSES } },
            data: { status: BookingStatus.PAID },
          });
          if (paid.count === 1) return { status: 'success' as const };
        }

        // Statut relu : il a pu changer (expiration, annulation) entre-temps.
        const current = otherPayment
          ? booking
          : await tx.booking.findUnique({ where: { id: payment.bookingId }, select: { status: true } });
        refundReason = otherPayment ? RefundReason.DOUBLE_PAYMENT : this.refundReasonFor(current?.status);
        await tx.payment.update({
          where: { id: payment.id },
          data: { refundRequiredAt: this.now(), refundReason },
        });
        return { status: 'refund_required' as const, refundReason };
      });

      if (outcome.status === 'success') {
        this.logger.log(
          `[WEBHOOK_SUCCESS] event=payment.success bookingId=${payment.bookingId} paymentId=${payment.id} status=PAID`,
        );
      } else if (outcome.status === 'refund_required') {
        this.logger.warn(
          `[REFUND_REQUIRED] reason=${outcome.refundReason} amount=${payment.amount} currency=${payment.currency} ` +
            `paymentId=${payment.id} transactionId=${reference} bookingId=${payment.bookingId}`,
        );
      }
      return { status: outcome.status };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[WEBHOOK_DB_FAILURE] ${msg}`);
      throw e;
    }
  }

  /**
   * Par référence GeniusPay d'abord ; sinon par `metadata.paymentId`, à
   * condition que `metadata.bookingId` concorde (jamais par bookingId seul).
   */
  private async findWebhookPayment(reference: string, metadata?: GeniusPayWebhookMetadata) {
    const byReference = await this.prisma.payment.findFirst({
      where: { transactionId: reference },
      orderBy: { createdAt: 'desc' },
    });
    if (byReference) return byReference;

    if (!metadata?.paymentId || !metadata.bookingId) return null;
    const byId = await this.prisma.payment.findUnique({ where: { id: metadata.paymentId } });
    if (!byId || byId.bookingId !== metadata.bookingId) return null;
    return byId;
  }

  private refundReasonFor(status: BookingStatus | undefined): RefundReason {
    if (status === BookingStatus.EXPIRED) return RefundReason.BOOKING_EXPIRED;
    if (status === BookingStatus.CANCELLED) return RefundReason.BOOKING_CANCELLED;
    return RefundReason.DOUBLE_PAYMENT;
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
