import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PartnerApiException } from './partner-api.errors';
import { setPartner } from './request-context';

/**
 * Clés d'API partenaires — mécanisme minimal V1, sans table en base.
 *
 * Variable d'environnement PARTNER_API_KEYS : entrées « partenaire:empreinte »
 * séparées par des virgules, où l'empreinte est le SHA-256 hexadécimal de la clé.
 * Le serveur ne connaît jamais la clé en clair. Plusieurs entrées par partenaire
 * sont admises (rotation sans coupure) ; retirer une entrée révoque la clé au
 * redémarrage. Variable absente ou vide → toutes les requêtes partenaires refusées.
 *
 * Format d'une clé : « dvp_ » + 32 octets aléatoires en base64url (43 caractères).
 * Procédure de génération : docs/partner-api-v1.md.
 */
export const PARTNER_API_KEYS_ENV = 'PARTNER_API_KEYS';
export const PARTNER_API_KEY_HEADER = 'x-api-key';

const API_KEY_FORMAT = /^dvp_[A-Za-z0-9_-]{43}$/;
const PARTNER_ID_FORMAT = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface PartnerKeyEntry {
  partnerId: string;
  digest: Buffer;
}

/** Lit la configuration ; les entrées mal formées sont ignorées et seulement comptées. */
export function parsePartnerApiKeys(raw: string | undefined): {
  entries: PartnerKeyEntry[];
  invalid: number;
} {
  const entries: PartnerKeyEntry[] = [];
  let invalid = 0;
  for (const item of (raw ?? '').split(',')) {
    const value = item.trim();
    if (!value) continue;
    const separator = value.indexOf(':');
    const partnerId = value.slice(0, separator);
    const hex = value.slice(separator + 1).toLowerCase();
    if (
      separator < 1 ||
      !PARTNER_ID_FORMAT.test(partnerId) ||
      !SHA256_HEX.test(hex)
    ) {
      invalid++;
      continue;
    }
    entries.push({ partnerId, digest: Buffer.from(hex, 'hex') });
  }
  return { entries, invalid };
}

export function hashPartnerApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Authentifie le partenaire par l'en-tête X-API-Key. Comparaison en temps constant
 * avec toutes les empreintes configurées (pas d'arrêt à la première correspondance).
 * Indépendant des jetons JWT utilisateurs : un Bearer n'ouvre pas cette API.
 */
@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  private readonly logger = new Logger('PartnerApi');
  private readonly entries: PartnerKeyEntry[];

  constructor(config: ConfigService) {
    const { entries, invalid } = parsePartnerApiKeys(
      config.get<string>(PARTNER_API_KEYS_ENV),
    );
    this.entries = entries;
    const partners = new Set(entries.map((entry) => entry.partnerId)).size;
    if (invalid > 0) {
      this.logger.error(
        `${PARTNER_API_KEYS_ENV} : ${invalid} entrée(s) mal formée(s) ignorée(s)`,
      );
    }
    if (entries.length === 0) {
      this.logger.warn(
        `${PARTNER_API_KEYS_ENV} vide : l'API partenaire refuse toutes les requêtes`,
      );
    } else {
      this.logger.log(
        `API partenaire : ${entries.length} clé(s) active(s) pour ${partners} partenaire(s)`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[PARTNER_API_KEY_HEADER];
    const key = typeof header === 'string' ? header.trim() : '';

    if (API_KEY_FORMAT.test(key)) {
      const digest = createHash('sha256').update(key, 'utf8').digest();
      let partnerId: string | null = null;
      for (const entry of this.entries) {
        if (timingSafeEqual(entry.digest, digest) && partnerId === null)
          partnerId = entry.partnerId;
      }
      if (partnerId !== null) {
        setPartner(request, { id: partnerId });
        return true;
      }
    }

    throw new PartnerApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_API_KEY',
      'Clé d’API absente ou invalide (en-tête X-API-Key).',
    );
  }
}
