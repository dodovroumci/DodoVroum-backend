import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException, 
  NotFoundException,
  UnauthorizedException 
} from '@nestjs/common';
import { VehiclesService } from '../vehicles.service';

/**
 * @class VehicleOwnerGuard
 * @description Assure que seul le propriétaire d'un véhicule ou un administrateur 
 * peut effectuer des actions de modification/suppression.
 */
@Injectable()
export class VehicleOwnerGuard implements CanActivate {
  constructor(private readonly vehiclesService: VehiclesService) {}

  /**
   * @param {ExecutionContext} context - Contexte d'exécution de la requête NestJS.
   * @returns {Promise<boolean>} Autorise ou refuse l'accès.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Injecté par le JwtStrategy
    const vehicleId = request.params.id;

    // 1. Vérification de l'authentification
    if (!user) {
      throw new UnauthorizedException('Utilisateur non identifié dans le contexte de la requête.');
    }

    // 2. RÈGLE D'OR : BYPASS ADMIN
    // L'administrateur a un accès universel sur toutes les ressources.
    // On normalise en majuscules pour éviter les erreurs de saisie en base.
    const userRole = user.role?.toUpperCase();
    if (userRole === 'ADMIN') {
      return true;
    }

    // 3. Vérification de l'existence du paramètre ID
    if (!vehicleId) {
      throw new ForbiddenException('Identifiant du véhicule manquant dans la requête.');
    }

    // 4. VÉRIFICATION DE LA PROPRIÉTÉ (Pour les Partners)
    // Utilisation de la méthode isOwner définie dans le VehiclesService.
    try {
      const isOwner = await this.vehiclesService.isOwner(vehicleId, user.id);

      if (!isOwner) {
        throw new ForbiddenException(
          `Accès refusé : vous (ID: ${user.id}) n'êtes pas le propriétaire de ce véhicule.`
        );
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`Véhicule avec l'ID ${vehicleId} introuvable.`);
      }
      throw error;
    }

    return true;
  }
}
