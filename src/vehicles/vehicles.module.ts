import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehicleTypesController } from './vehicle-types.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';

@Module({
  controllers: [VehiclesController, VehicleTypesController],
  providers: [VehiclesService, VehicleOwnerGuard],
  exports: [VehiclesService],
})
export class VehiclesModule {}
