import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehicleTypesController } from './vehicle-types.controller';
import { VehiclesService } from './vehicles.service';
import { PaginationService } from '../common/services/pagination.service';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';

@Module({
  controllers: [VehiclesController, VehicleTypesController], // ✅ Rétabli
  providers: [VehiclesService, PaginationService, VehicleOwnerGuard],
  exports: [VehiclesService],
})
export class VehiclesModule {}
