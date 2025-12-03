import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OffersService } from '../offers.service';

@Injectable()
export class OfferOwnerGuard implements CanActivate {
  constructor(private readonly offersService: OffersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const offerId = request.params.id;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    if (!offerId) {
      throw new NotFoundException('ID d\'offre manquant');
    }

    // Les administrateurs peuvent toujours modifier/supprimer
    if (user.role === 'ADMIN') {
      return true;
    }

    // Vérifier si l'utilisateur est propriétaire de l'offre
    const isOwner = await this.offersService.isOwner(offerId, user.id);

    if (!isOwner) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à modifier cette offre. Seul le propriétaire peut effectuer cette action.');
    }

    return true;
  }
}

