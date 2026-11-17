import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Partenaire authentifié par PartnerApiKeyGuard. */
export interface AuthenticatedPartner {
  id: string;
}

const REQUEST_ID = Symbol('partnerApi.requestId');
const PARTNER = Symbol('partnerApi.partner');

type ContextRequest = Request & {
  [REQUEST_ID]?: string;
  [PARTNER]?: AuthenticatedPartner;
};

/** Identifiant de la requête (créé par le middleware, à défaut ici). */
export function getRequestId(request: Request): string {
  const req = request as ContextRequest;
  req[REQUEST_ID] ??= randomUUID();
  return req[REQUEST_ID];
}

export function setPartner(
  request: Request,
  partner: AuthenticatedPartner,
): void {
  (request as ContextRequest)[PARTNER] = partner;
}

export function getPartner(request: Request): AuthenticatedPartner | undefined {
  return (request as ContextRequest)[PARTNER];
}

/**
 * Attribue un X-Request-Id à chaque requête des API publique/partenaire et journalise
 * une ligne par réponse : API, partenaire, route modèle, statut, durée.
 * Jamais : clé d'API, paramètres de requête (une recherche libre peut contenir des
 * données personnelles), adresse IP.
 */
@Injectable()
export class PartnerApiRequestMiddleware implements NestMiddleware {
  private readonly logger = new Logger('PartnerApi');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = getRequestId(req);
    const startedAt = process.hrtime.bigint();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const route = req.route?.path
        ? `${req.baseUrl}${req.route.path}`
        : 'unmatched';
      const partner = getPartner(req)?.id ?? '-';
      const api = req.originalUrl.includes('/partner/') ? 'partner' : 'public';
      this.logger.log(
        `requestId=${requestId} api=${api} partner=${partner} ${req.method} ${route} ` +
          `status=${res.statusCode} durationMs=${durationMs.toFixed(1)}`,
      );
    });

    next();
  }
}
