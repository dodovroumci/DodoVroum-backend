import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { GeniusPayWebhookIpGuard } from './guards/geniuspay-webhook-ip.guard';
import { GeniusPaySignatureGuard } from './guards/geniuspay-signature.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, GeniusPayWebhookIpGuard, GeniusPaySignatureGuard],
})
export class PaymentsModule {}
