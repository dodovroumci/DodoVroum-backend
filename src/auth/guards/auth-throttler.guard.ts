import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Utiliser l'IP + email pour le rate limiting sur l'auth
    const email = req.body?.email || '';
    return `${req.ip}-${email}`;
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // Rate limiting plus strict pour l'authentification
    const key = await this.getTracker(req);
    const record = await this.storageService.increment(key, ttl);
    const totalHits = record?.totalHits ?? 0;

    if (totalHits > limit) {
      throw new Error(
        'Trop de tentatives de connexion. Veuillez réessayer plus tard.',
      );
    }

    return true;
  }
}
