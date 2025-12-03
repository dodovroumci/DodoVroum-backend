import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResidencesService } from '../residences.service';

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

    if (!residenceId) {
      throw new NotFoundException('ID de résidence manquant');
    }

    // Les administrateurs peuvent toujours modifier/supprimer
    if (user.role === 'ADMIN') {
      return true;
    }

    // Vérifier si l'utilisateur est propriétaire de la résidence
    const isOwner = await this.residencesService.isOwner(residenceId, user.id);

    if (!isOwner) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à modifier cette résidence. Seul le propriétaire peut effectuer cette action.');
    }

    return true;
  }
}

