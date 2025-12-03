import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@Controller('vehicle-types')
export class VehicleTypesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les types de véhicules disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des types de véhicules' })
  getVehicleTypes() {
    return this.vehiclesService.getVehicleTypes();
  }
}

