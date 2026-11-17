/**
 * Configuration de la limitation des connexions (compteur IP + e-mail, partagé par
 * /auth/login, /auth/login/client et /auth/login/proprio).
 *
 * Variable absente : valeur par défaut documentée ci-dessous.
 * Variable présente mais invalide (vide, non entière, hors bornes) : erreur explicite,
 * l'API refuse de démarrer. Aucun repli silencieux sur la valeur par défaut.
 */
export const LOGIN_THROTTLE_ENV = {
  /** Nombre de tentatives (réussies ou échouées) autorisées par IP + e-mail sur la fenêtre. */
  limit: 'AUTH_LOGIN_LIMIT',
  /** Durée de la fenêtre glissante, en secondes. */
  windowSeconds: 'AUTH_LOGIN_WINDOW_SECONDS',
} as const;

export const LOGIN_THROTTLE_DEFAULTS = {
  limit: 5,
  windowSeconds: 300,
} as const;

const BOUNDS = {
  limit: { min: 1, max: 1000 },
  windowSeconds: { min: 1, max: 86400 },
} as const;

export interface LoginThrottleConfig {
  limit: number;
  windowSeconds: number;
  /** Fenêtre en millisecondes, unité attendue par @nestjs/throttler 5. */
  windowMs: number;
}

/** Lit et valide la configuration ; lève une erreur explicite si une valeur est invalide. */
export function loadLoginThrottleConfig(env: Record<string, string | undefined>): LoginThrottleConfig {
  const limit = readInteger(env, 'limit');
  const windowSeconds = readInteger(env, 'windowSeconds');
  return { limit, windowSeconds, windowMs: windowSeconds * 1000 };
}

function readInteger(env: Record<string, string | undefined>, field: keyof typeof BOUNDS): number {
  const name = LOGIN_THROTTLE_ENV[field];
  const raw = env[name];
  if (raw === undefined) return LOGIN_THROTTLE_DEFAULTS[field];

  const { min, max } = BOUNDS[field];
  const text = raw.trim();
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < min || value > max) {
    throw new Error(
      `Configuration invalide : ${name}="${raw}". Entier attendu entre ${min} et ${max} ` +
        `(valeur par défaut si la variable est absente : ${LOGIN_THROTTLE_DEFAULTS[field]}).`,
    );
  }
  return value;
}
