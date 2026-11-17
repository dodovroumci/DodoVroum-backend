import { applyDecorators, ExecutionContext, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { normalizeIpForRateLimit } from '../../common/http/client-ip';
import { loadLoginThrottleConfig } from '../auth-throttle.config';
import { AuthThrottlerGuard } from '../guards/auth-throttler.guard';
import { LocalAuthGuard } from '../guards/local-auth.guard';

/**
 * Compteur IP + e-mail des trois routes de connexion.
 * IP normalisée (IPv4 mappée → IPv4, IPv6 → /64) uniquement ici : les autres routes
 * d'authentification gardent le suivi de AuthThrottlerGuard.getTracker, inchangé.
 */
export function loginThrottleTracker(req: Record<string, any>): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return JSON.stringify([normalizeIpForRateLimit(req.ip), email]);
}

/**
 * Clé de stockage commune à /login, /login/client et /login/proprio (la clé par défaut du
 * throttler inclut la route, ce qui triplait le nombre d'essais). Hachée en SHA-256 : aucun
 * e-mail en clair en mémoire, et aucune collision possible avec les clés MD5 des autres limites.
 */
export function loginThrottleKey(_context: ExecutionContext, tracker: string, throttlerName: string): string {
  return createHash('sha256').update(JSON.stringify(['auth-login', 'ip+email', throttlerName, tracker])).digest('hex');
}

// Seuils lus à chaque requête dans AUTH_LOGIN_LIMIT / AUTH_LOGIN_WINDOW_SECONDS
// (validés au démarrage par AuthModule : une valeur invalide empêche l'API de démarrer).
const loginThrottleLimit = () => loadLoginThrottleConfig(process.env).limit;
const loginThrottleTtl = () => loadLoginThrottleConfig(process.env).windowMs;

/**
 * Limitation des connexions. AuthThrottlerGuard passe AVANT LocalAuthGuard : chaque tentative,
 * réussie ou échouée, est comptée avant la vérification du mot de passe, et une tentative
 * bloquée n'atteint jamais bcrypt.
 */
export const LoginThrottle = () =>
  applyDecorators(
    UseGuards(AuthThrottlerGuard, LocalAuthGuard),
    Throttle({
      default: {
        limit: loginThrottleLimit,
        ttl: loginThrottleTtl,
        getTracker: loginThrottleTracker,
        generateKey: loginThrottleKey,
      },
    }),
  );
