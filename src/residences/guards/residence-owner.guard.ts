import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResidencesService } from '../residences.service';

/**
 * Guard de sécurité pour les résidences.
 * Priorité absolue à l'ADMIN pour permettre la modération.
 */
@Injectable()
export class ResidenceOwnerGuard implements CanActivate {
  constructor(private readonly residencesService: ResidencesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const residenceId = request.params.id;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    // ✅ NORMALISATION CRITIQUE : Convertit 'admin' ou 'ADMIN' en 'ADMIN'
    const userRole = user.role?.toUpperCase();
    
    // 1. Si Admin, on bypass tout le reste (même si la résidence n'existe pas encore dans le check)
    if (userRole === 'ADMIN') {
      return true;
    }

    if (!residenceId) {
      throw new NotFoundException('ID de résidence manquant');
    }

    // 2. Vérification de propriété pour les partenaires
    // On utilise une méthode optimisée du service
    const isOwner = await this.residencesService.isOwner(residenceId, user.id);

    if (!isOwner) {
      throw new ForbiddenException(
        "Accès refusé. Seul le propriétaire ou un administrateur peut modifier cette résidence."
      );
    }

    return true;
  }
}
