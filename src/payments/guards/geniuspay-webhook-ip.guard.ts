import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * IP du client telle que calculée par Express (`req.ip`), seule source retenue.
 *
 * Derrière nginx, TRUST_PROXY active `trust proxy = 1` : req.ip est la dernière entrée de
 * X-Forwarded-For, ajoutée par nginx. Les entrées précédentes, fournies par l’appelant,
 * sont falsifiables : X-Forwarded-For n’est donc jamais lu directement ici.
 * IP indéterminée → '' (refusée par le guard lorsque la whitelist est active).
 */
export function getClientIp(req: Request): string {
  return normalizeIp(req.ip ?? '');
}

function normalizeIp(ip: string): string {
  if (!ip) return '';
  // IPv4-mapped IPv6 → IPv4 pour comparaison avec la whitelist
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * N’autorise le webhook GeniusPay que depuis des IPs listées dans GENIUSPAY_WEBHOOK_ALLOWED_IPS.
 * Si la variable est vide : accès autorisé + avertissement log (préprod / en attendant la doc GeniusPay).
 */
@Injectable()
export class GeniusPayWebhookIpGuard implements CanActivate {
  private readonly logger = new Logger(GeniusPayWebhookIpGuard.name);
  private warnedEmptyWhitelist = false;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const raw = this.config.get<string>('GENIUSPAY_WEBHOOK_ALLOWED_IPS') ?? '';
    const allowed = raw
      .split(',')
      .map((s) => normalizeIp(s.trim()))
      .filter(Boolean);

    if (allowed.length === 0) {
      if (!this.warnedEmptyWhitelist) {
        this.logger.warn(
          'GENIUSPAY_WEBHOOK_ALLOWED_IPS est vide : le webhook n’est pas filtré par IP. ' +
            'Définissez les IPs GeniusPay ou activez la signature HMAC dès que possible.',
        );
        this.warnedEmptyWhitelist = true;
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const clientIp = normalizeIp(getClientIp(req));

    if (!clientIp) {
      this.logger.warn('Impossible de déterminer l’IP du client pour le webhook GeniusPay');
      throw new ForbiddenException('Accès refusé');
    }

    if (allowed.includes(clientIp)) {
      return true;
    }

    this.logger.warn(
      `Webhook GeniusPay refusé : IP "${clientIp}" non autorisée (whitelist : ${allowed.join(', ')})`,
    );
    throw new ForbiddenException('Accès refusé');
  }
}
