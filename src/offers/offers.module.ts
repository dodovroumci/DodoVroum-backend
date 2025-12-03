import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { ResidencesModule } from '../residences/residences.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { OfferOwnerGuard } from './guards/offer-owner.guard';

@Module({
  imports: [ResidencesModule, VehiclesModule],
  controllers: [OffersController],
  providers: [OffersService, OfferOwnerGuard],
  exports: [OffersService],
})
export class OffersModule {}
