import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Restreint un endpoint aux comptes PROPRIETAIRE ou ADMIN. Utilisé notamment
 * sur la création de véhicules/résidences : avant ce guard, tout utilisateur
 * authentifié (y compris un CLIENT) pouvait créer une annonce.
 */
@Injectable()
export class PartnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    const role = user.role?.toUpperCase?.() ?? user.role;
    if (role !== UserRole.PROPRIETAIRE && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Réservé aux propriétaires et administrateurs');
    }

    return true;
  }
}
