import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferExpirationService } from './services/offer-expiration.service';
import { PaginationService } from '../common/services/pagination.service';
import { ResidencesModule } from '../residences/residences.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { OfferOwnerGuard } from './guards/offer-owner.guard';

@Module({
  imports: [ResidencesModule, VehiclesModule],
  controllers: [OffersController],
  providers: [OffersService, OfferExpirationService, PaginationService, OfferOwnerGuard],
  exports: [OffersService],
})
export class OffersModule {}
