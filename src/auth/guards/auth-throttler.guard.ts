import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGenerateKeyFunction,
  ThrottlerGetTrackerFunction,
  ThrottlerGuard,
  ThrottlerOptions,
} from '@nestjs/throttler';

// ThrottlerLimitDetail n'est pas exporté par l'API publique de @nestjs/throttler v5 :
// on le déduit de la signature de ThrottlerGuard plutôt que d'importer un fichier interne.
type ThrottlerLimitDetail = Parameters<ThrottlerGuard['throwThrottlingException']>[1];

export const TOO_MANY_REQUESTS_MESSAGE = 'Trop de demandes. Réessayez dans quelques minutes.';

export interface AuthIpThrottleRule {
  limit: number;
  ttl: number;
}

const AUTH_IP_THROTTLE = 'auth:ip-throttle';

/**
 * Limite supplémentaire par IP seule (en plus de IP + email), pour empêcher
 * d'enchaîner les demandes sur des adresses différentes. Volontairement plus
 * large que la limite IP + email : beaucoup d'utilisateurs mobiles partagent
 * une IP (NAT opérateur).
 */
export const AuthIpThrottle = (rule: AuthIpThrottleRule) => SetMetadata(AUTH_IP_THROTTLE, rule);

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Utiliser l'IP + email pour le rate limiting sur l'auth
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${req.ip}-${email}`;
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    const ipRule = this.reflector.getAllAndOverride<AuthIpThrottleRule>(AUTH_IP_THROTTLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (ipRule) {
      const { req } = this.getRequestResponse(context);
      const tracker = `ip:${req.ip}`;
      const key = generateKey(context, tracker, `${throttler.name}-ip`);
      const { totalHits, timeToExpire } = await this.storageService.increment(key, ipRule.ttl);
      if (totalHits > ipRule.limit) {
        await this.throwThrottlingException(context, {
          limit: ipRule.limit,
          ttl: ipRule.ttl,
          key,
          tracker,
          totalHits,
          timeToExpire,
        });
      }
    }
    // Clés par route + HTTP 429 (Retry-After) gérés par ThrottlerGuard.
    return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(TOO_MANY_REQUESTS_MESSAGE);
  }
}
