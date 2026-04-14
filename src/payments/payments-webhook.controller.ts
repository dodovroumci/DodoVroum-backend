import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhooks/geniuspay')
  @UseGuards(GeniusPayWebhookIpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook GeniusPay — confirmation de paiement',
    description:
      'Réservé aux IPs listées dans GENIUSPAY_WEBHOOK_ALLOWED_IPS (séparées par des virgules). ' +
      'Derrière un reverse proxy, activer TRUST_PROXY=true pour une IP correcte.',
  })
  handleGeniusPay(
    @Body() body: unknown,
    @Headers('x-geniuspay-signature') signature?: string,
  ) {
    return this.paymentsService.handleGeniusPayWebhook(body, signature);
  }
}
