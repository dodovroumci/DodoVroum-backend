import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from '../vehicles.service';

@Injectable()
export class VehicleOwnerGuard implements CanActivate {
  constructor(private readonly vehiclesService: VehiclesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const vehicleId = request.params.id;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    if (!vehicleId) {
      throw new NotFoundException('ID de véhicule manquant');
    }

    // Les administrateurs peuvent toujours modifier/supprimer
    if (user.role === 'ADMIN') {
      return true;
    }

    // Vérifier si l'utilisateur est propriétaire du véhicule
    const isOwner = await this.vehiclesService.isOwner(vehicleId, user.id);

    if (!isOwner) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à modifier ce véhicule. Seul le propriétaire peut effectuer cette action.');
    }

    return true;
  }
}

