import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';

/**
 * Contrôleur gérant les types de véhicules.
 * Aligné sur la route attendue par le client Flutter/Mobile.
 */
@ApiTags('Vehicles')
@Controller('vehicles/types') // MODIFICATION ICI : 'vehicle-types' -> 'vehicles/types'
export class VehicleTypesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  /**
   * Récupère la liste exhaustive des types (SUV, Berline, etc.)
   * @returns {Promise<VehicleType[]>}
   */
  @Get()
  @ApiOperation({ summary: 'Obtenir tous les types de véhicules disponibles' })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des types de véhicules récupérée avec succès.' 
  })
  async getVehicleTypes() {
    return await this.vehiclesService.getVehicleTypes();
  }
}
