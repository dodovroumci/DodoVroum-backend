/**
 * Prise en compte du reverse proxy (nginx) pour déterminer l'IP réelle du client.
 *
 * Comportement identique à l'ancien bloc de main.ts : seules les valeurs exactes "true" et "1"
 * de TRUST_PROXY activent `trust proxy = 1`. Avec un seul proxy de confiance, req.ip est l'adresse
 * ajoutée par nginx (dernière entrée de X-Forwarded-For), jamais la plus à gauche, que le client
 * peut falsifier. Sans TRUST_PROXY, X-Forwarded-For est ignoré et req.ip est l'adresse du socket.
 */
export interface TrustProxyTarget {
  set(setting: string, value: unknown): unknown;
}

export interface TrustProxyLogger {
  log(message: string): unknown;
  warn(message: string): unknown;
}

export function isTrustProxyEnabled(env: Record<string, string | undefined>): boolean {
  return env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1';
}

/** Applique TRUST_PROXY à l'application et indique s'il est activé. */
export function configureTrustProxy(
  app: TrustProxyTarget,
  env: Record<string, string | undefined>,
  logger: TrustProxyLogger,
): boolean {
  if (isTrustProxyEnabled(env)) {
    // 1 = un seul proxy de confiance (nginx) : req.ip = IP vue par nginx,
    // pas la valeur la plus à gauche de X-Forwarded-For (falsifiable par le client).
    app.set('trust proxy', 1);
    logger.log('Trust proxy activé (TRUST_PROXY) — IP client fiable pour les webhooks');
    return true;
  }

  if (env.NODE_ENV === 'production') {
    // Avertissement seulement : derrière nginx sans TRUST_PROXY, tous les clients partagent
    // l'adresse du proxy (limitation de débit et filtrage webhook faussés).
    logger.warn(
      'TRUST_PROXY non activé en production : derrière nginx, req.ip sera l’adresse du proxy pour tous les clients.',
    );
  }
  return false;
}
