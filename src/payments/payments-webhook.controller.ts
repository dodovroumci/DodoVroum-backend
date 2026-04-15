import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { GeniusPayWebhookIpGuard } from './guards/geniuspay-webhook-ip.guard';

/**
 * Webhooks GeniusPay : pas de JWT (appel serveur à serveur).
 * Filtre IP via {@link GeniusPayWebhookIpGuard} + variable GENIUSPAY_WEBHOOK_ALLOWED_IPS.
 * Signature HMAC à ajouter lorsque GeniusPay fournit le secret.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post(['geniuspay', 'webhooks/geniuspay'])
  @UseGuards(GeniusPayWebhookIpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook GeniusPay — confirmation de paiement',
    description:
      'Référence possible : reference, order_id, payment_reference ou data.reference. ' +
      'IPs listées dans GENIUSPAY_WEBHOOK_ALLOWED_IPS. Derrière un reverse proxy : TRUST_PROXY=true.',
  })
  async handleWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-geniuspay-signature') _signature?: string,
  ) {
    // GeniusPay envoie souvent la référence dans 'reference' ou 'order_id'
    this.logger.log(`📦 Webhook reçu: ${JSON.stringify(body)}`);

    const data = body['data'] as Record<string, unknown> | undefined;
    const reference =
      (body['reference'] as string | undefined) ??
      (body['order_id'] as string | undefined) ??
      (body['payment_reference'] as string | undefined) ??
      data?.['reference']?.toString();

    const statusRaw =
      body['event'] === 'payment.success'
        ? 'SUCCESS'
        : ((body['status'] as string | undefined) ?? (data?.['status'] as string | undefined))?.toString();

    const channel = (data?.['channel'] as string | undefined) ?? (body['channel'] as string | undefined);

    if (!reference) {
      return { status: 'error', message: 'Missing reference' };
    }

    return this.paymentsService.validatePayment(String(reference), statusRaw, channel);
  }
}
