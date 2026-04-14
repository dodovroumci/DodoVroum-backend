import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  NotificationType,
} from '@prisma/client';
import axios, { isAxiosError } from 'axios';
import * as crypto from 'crypto';

/** Taux de frais plateforme sur le montant de base (réservation). */
const PLATFORM_FEE_RATE = 0.01;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private verifyGeniusPaySignature(rawBody: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  /**
   * Webhook GeniusPay : met à jour le paiement et la réservation selon le statut.
   * Tolère plusieurs formes de payload (`data` imbriqué ou statuts alternatifs).
   */
  async handleGeniusPayWebhook(raw: unknown, signature?: string) {
    const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const data = (root.data ?? root) as Record<string, unknown>;
    const reference = (data.reference ??
      data.transaction_id ??
      data.transactionId) as string | undefined;
    const statusRaw = (data.status ?? data.payment_status ?? data.state) as string | undefined;
    const metadata =
      data.metadata && typeof data.metadata === 'object'
        ? (data.metadata as Record<string, unknown>)
        : {};
    const bookingIdMeta = metadata.bookingId as string | undefined;

    const status = typeof statusRaw === 'string' ? statusRaw.toUpperCase() : '';
    this.logger.log(
      `[Webhook Received] ref=${reference ?? '-'} status=${status || String(statusRaw ?? '-')} booking=${bookingIdMeta ?? '-'}`,
    );

    const webhookSecret = this.config.get<string>('GENIUSPAY_WEBHOOK_SECRET')?.trim();
    if (webhookSecret) {
      const normalizedSignature = signature?.trim();
      if (!normalizedSignature) {
        this.logger.error(
          `[Security Alert] Signature manquante pour ref=${reference ?? '-'} (secret configuré)`,
        );
        throw new BadRequestException('Signature webhook manquante');
      }
      const rawBody = JSON.stringify(raw ?? {});
      const isValid = this.verifyGeniusPaySignature(rawBody, normalizedSignature, webhookSecret);
      if (!isValid) {
        this.logger.error(`[Security Alert] Signature invalide pour ref=${reference ?? '-'}`);
        throw new BadRequestException('Invalid signature');
      }
    }

    const orConditions: Prisma.PaymentWhereInput[] = [];
    if (reference?.trim()) {
      orConditions.push({ transactionId: reference.trim() });
    }
    if (bookingIdMeta?.trim()) {
      orConditions.push({
        bookingId: bookingIdMeta.trim(),
        status: PaymentStatus.PENDING,
      });
    }

    if (orConditions.length === 0) {
      this.logger.warn('[GeniusPay Webhook] Payload sans référence ni bookingId exploitable');
      return { message: 'Payload invalide ou incomplet' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { OR: orConditions },
    });

    if (!payment) {
      return { message: 'Paiement introuvable' };
    }

    if (bookingIdMeta && payment.bookingId !== bookingIdMeta.trim()) {
      this.logger.warn(
        `[GeniusPay Webhook] Incohérence metadata.bookingId (${bookingIdMeta}) vs payment.bookingId (${payment.bookingId})`,
      );
      return { message: 'Référence incohérente' };
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return { message: 'Déjà traité ou introuvable' };
    }

    const successStatuses = new Set(['ACCEPTED', 'SUCCESS', 'COMPLETED', 'PAID', 'APPROVED']);
    const failedStatuses = new Set(['FAILED', 'REJECTED', 'DECLINED', 'CANCELLED', 'CANCELED']);

    if (successStatuses.has(status)) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            transactionId: reference?.trim() ?? payment.transactionId,
          },
        });

        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: BookingStatus.PAID },
        });
      });

      try {
        await this.notificationsService.createNotification(
          payment.userId,
          'Paiement confirmé',
          'Votre paiement a bien été reçu pour cette réservation.',
          NotificationType.PAYMENT_RECEIVED,
          payment.bookingId,
        );
      } catch (e) {
        this.logger.warn(`[GeniusPay Webhook] Notification non envoyée: ${e}`);
      }

      this.logger.log(`[Webhook Success] booking=${payment.bookingId} ref=${reference ?? '-'}`);
      return { status: 'success' };
    }

    if (failedStatuses.has(status)) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          transactionId: reference?.trim() ?? payment.transactionId,
        },
      });
      this.logger.warn(`[Webhook Failed] ref=${reference ?? '-'} status=${status}`);
      return { status: 'failed' };
    }

    this.logger.warn(`[GeniusPay Webhook] Statut non reconnu: ${String(statusRaw)}`);
    return { message: 'Statut non reconnu' };
  }

  /**
   * Initialise un paiement GeniusPay : montant réservation + 1 % de frais, enregistrement Payment PENDING.
   */
  async initializeGeniusPayPayment(bookingId: string, requesterUserId: string) {
    const apiKey = this.config.get<string>('GENIUSPAY_API_KEY');
    const apiSecret = this.config.get<string>('GENIUSPAY_API_SECRET');
    if (!apiKey?.trim() || !apiSecret?.trim()) {
      throw new BadRequestException(
        'Configuration GeniusPay manquante : définissez GENIUSPAY_API_KEY et GENIUSPAY_API_SECRET.',
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });

    if (!booking) {
      throw new NotFoundException('Réservation non trouvée');
    }

    if (booking.userId !== requesterUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez initier un paiement que pour vos propres réservations.',
      );
    }

    const basePrice = booking.totalPrice;
    const fees = Math.ceil(basePrice * PLATFORM_FEE_RATE);
    const totalToPay = basePrice + fees;

    const geniusPayUrl =
      this.config.get<string>('GENIUSPAY_API_URL') ??
      'https://api.geniuspay.com/api/v1/merchant/payments';

    const successUrl =
      this.config.get<string>('GENIUSPAY_SUCCESS_URL') ?? 'https://dodovroum.com/payment/success';
    const cancelUrl =
      this.config.get<string>('GENIUSPAY_CANCEL_URL') ?? 'https://dodovroum.com/payment/cancel';

    const customerName = [booking.user.firstName, booking.user.lastName].filter(Boolean).join(' ').trim() || 'Client';

    let checkoutUrl: string;
    let providerRef: string | undefined;

    try {
      const response = await axios.post(
        geniusPayUrl,
        {
          amount: totalToPay,
          currency: 'XOF',
          description: `DodoVroum - Réservation #${bookingId}`,
          customer: {
            name: customerName,
            email: booking.user.email,
          },
          metadata: { bookingId: booking.id },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        {
          headers: {
            'X-API-Key': apiKey,
            'X-API-Secret': apiSecret,
          },
          timeout: 30_000,
        },
      );

      const data = response.data?.data ?? response.data;
      checkoutUrl =
        data?.checkout_url ?? data?.checkoutUrl ?? response.data?.checkout_url ?? response.data?.checkoutUrl;

      providerRef =
        data?.id ?? data?.transaction_id ?? data?.transactionId ?? response.data?.id;

      if (!checkoutUrl || typeof checkoutUrl !== 'string') {
        this.logger.error(`GeniusPay réponse inattendue: ${JSON.stringify(response.data)}`);
        throw new BadGatewayException('Réponse GeniusPay invalide (pas d’URL de paiement).');
      }
    } catch (err) {
      if (isAxiosError(err)) {
        this.logger.error(
          `GeniusPay HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data ?? err.message)}`,
        );
      } else {
        this.logger.error(err);
      }
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException('Impossible de générer le lien de paiement GeniusPay.');
    }

    const payment = await this.prisma.payment.create({
      data: {
        amount: totalToPay,
        baseAmount: basePrice,
        fees,
        currency: 'XOF',
        status: 'PENDING',
        method: PaymentMethod.CARD,
        userId: booking.userId,
        bookingId: booking.id,
        transactionId: providerRef ?? `DV-${Date.now()}`,
      },
    });

    return {
      checkoutUrl,
      paymentId: payment.id,
      amount: totalToPay,
      fees,
      baseAmount: basePrice,
      currency: 'XOF',
    };
  }

  async create(createPaymentDto: CreatePaymentDto, userId: string) {
    return this.prisma.payment.create({
      data: {
        ...createPaymentDto,
        userId, // injecté ici, pas dans le DTO
      } as Prisma.PaymentUncheckedCreateInput,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.payment.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Paiement non trouvé');
    }

    return payment;
  }

  async findByUser(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto) {
    await this.findOne(id);

    return this.prisma.payment.update({
      where: { id },
      data: updatePaymentDto,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.payment.delete({
      where: { id },
    });
  }
}
