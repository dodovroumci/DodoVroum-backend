import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { getPartner } from './request-context';

/**
 * Quotas des API publique et partenaire (throttler « default » de AppModule, fenêtre en ms).
 * Compteurs en mémoire du processus : avec plusieurs instances (cluster PM2), chaque
 * instance applique son propre quota ; un stockage partagé (Redis) sera nécessaire à ce moment-là.
 */
export const QUOTA_WINDOW_MS = 60_000;

/** Page web : par adresse IP (req.ip, fiable derrière nginx avec TRUST_PROXY=true). */
export const PUBLIC_DETAIL_LIMIT = 60;

/** Partenaire : par partenaire et par route. */
export const PARTNER_READ_LIMIT = 60;
export const PARTNER_AVAILABILITY_LIMIT = 20;

/**
 * Quota par partenaire authentifié. À placer après PartnerApiKeyGuard : sans
 * partenaire identifié, repli sur l'adresse IP.
 */
@Injectable()
export class PartnerThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const partner = getPartner(req as Request);
    return partner ? `partner:${partner.id}` : `ip:${req.ip}`;
  }
}
