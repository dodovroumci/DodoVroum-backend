import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';

/**
 * Webhooks GeniusPay : pas de JWT (appel serveur à serveur).
 * Filtre IP via {@link GeniusPayWebhookIpGuard} + variable GENIUSPAY_WEBHOOK_ALLOWED_IPS.
 * Signature HMAC à ajouter lorsque GeniusPay fournit le secret.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('geniuspay')
  // @UseGuards(GeniusPayWebhookIpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook GeniusPay — confirmation de paiement',
    description:
      'Référence possible : reference, order_id, payment_reference ou data.reference. ' +
      'IPs listées dans GENIUSPAY_WEBHOOK_ALLOWED_IPS. Derrière un reverse proxy : TRUST_PROXY=true.',
  })
  async handleWebhook(@Body() body: any) {
    console.log('--- [WEBHOOK RECEIVE] ---');
    console.log(body); // Visible dans les logs PM2

    const data = body?.data as Record<string, unknown> | undefined;
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
