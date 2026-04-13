import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PaginationService } from '../common/services/pagination.service';
import { ResidencesModule } from '../residences/residences.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { OfferOwnerGuard } from './guards/offer-owner.guard';

@Module({
  imports: [ResidencesModule, VehiclesModule],
  // ⚠️ ISOLATION DIAGNOSTIC SWAGGER
  	 controllers: [OffersController], 
  providers: [OffersService, PaginationService, OfferOwnerGuard],
  exports: [OffersService],
})
export class OffersModule {}
