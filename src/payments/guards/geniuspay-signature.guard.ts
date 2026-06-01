import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class GeniusPaySignatureGuard implements CanActivate {
  private readonly logger = new Logger(GeniusPaySignatureGuard.name);
  // Reject webhooks with a timestamp older than 5 minutes (prevents replay attacks)
  private readonly MAX_SKEW_SECONDS = 300;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('GENIUSPAY_WEBHOOK_SECRET');

    if (!secret) {
      this.logger.error('GENIUSPAY_WEBHOOK_SECRET manquant — tous les webhooks sont rejetés');
      throw new UnauthorizedException('Configuration manquante');
    }

    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-webhook-signature'] as string | undefined;
    const timestamp = request.headers['x-webhook-timestamp'] as string | undefined;

    if (!signature || !timestamp) {
      this.logger.warn('Webhook rejeté : en-têtes de sécurité manquants');
      throw new UnauthorizedException('En-têtes de sécurité manquants');
    }

    // Timestamp validation — reject stale or future webhooks
    const ts = parseInt(timestamp, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(nowSeconds - ts) > this.MAX_SKEW_SECONDS) {
      this.logger.warn(`Webhook rejeté : timestamp invalide ou expiré (ts=${timestamp})`);
      throw new UnauthorizedException('Timestamp invalide ou expiré');
    }

    const rawBody: Buffer = (request as any).rawBody;
    if (!rawBody) {
      this.logger.error('Raw body manquant. Vérifie main.ts (rawBody: true).');
      throw new UnauthorizedException('Corps de requête invalide');
    }

    const payload = rawBody.toString('utf8');
    const dataToSign = `${timestamp}.${payload}`;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex');

    if (expected !== signature) {
      this.logger.error('Signature mismatch!');
      this.logger.debug(`Data: ${dataToSign}`);
      throw new UnauthorizedException('Signature invalide');
    }

    return true;
  }
}
