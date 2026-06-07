import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { GeniusPaySignatureGuard } from './guards/geniuspay-signature.guard';
import { GeniusPayWebhookIpGuard } from './guards/geniuspay-webhook-ip.guard';

/**
 * Webhook server-to-server GeniusPay.
 * @Public() est intentionnel : GeniusPay n'envoie pas de JWT.
 * La sécurité repose sur GeniusPaySignatureGuard (HMAC-SHA256) + GeniusPayWebhookIpGuard (IP whitelist).
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger('PaymentsWebhook');

  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('geniuspay-test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Route de test temporaire — À SUPPRIMER' })
  async handleWebhookTest(@Body() body: any) {
    this.logger.log('GENIUSPAY_TEST_BODY: ' + JSON.stringify(body));
    return { status: 'received', body };
  }

  @Public()
  @UseGuards(GeniusPayWebhookIpGuard, GeniusPaySignatureGuard)
  @Post('geniuspay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook GeniusPay — confirmation de paiement' })
  async handleWebhook(@Body() body: any) {
    const event = body?.event as string | undefined;

    // Accept only payment.success — all other events are silently ignored
    if (event !== 'payment.success') {
      this.logger.log(`Webhook ignoré (event=${event ?? 'unknown'})`);
      return { status: 'ignored' };
    }

    const data = body?.data as Record<string, unknown> | undefined;

    const reference =
      (body['reference'] as string | undefined) ??
      (body['order_id'] as string | undefined) ??
      (body['payment_reference'] as string | undefined) ??
      data?.['reference']?.toString();

    if (!reference) {
      this.logger.warn('Webhook payment.success sans référence');
      throw new BadRequestException('Référence manquante');
    }

    // Extract amount reported by GeniusPay for server-side validation
    const rawAmount = data?.['amount'] ?? body['amount'];
    const webhookAmount =
      typeof rawAmount === 'number'
        ? rawAmount
        : typeof rawAmount === 'string'
        ? parseFloat(rawAmount)
        : undefined;

    const channel =
      (data?.['channel'] as string | undefined) ??
      (body['channel'] as string | undefined);

    this.logger.log(`Webhook payment.success reçu (ref=${reference})`);

    return this.paymentsService.validatePayment(reference, webhookAmount, channel);
  }
}
