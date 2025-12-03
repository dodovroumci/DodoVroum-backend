import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ResidencesModule } from '../residences/residences.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [
    ResidencesModule,
    VehiclesModule,
    OffersModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

