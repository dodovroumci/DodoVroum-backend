import { Module } from '@nestjs/common';
import { ResidencesController } from './residences.controller';
import { ResidencesService } from './residences.service';
import { PaginationService } from '../common/services/pagination.service';
import { CacheConfigModule } from '../cache/cache.module';
import { LoggingModule } from '../logging/logging.module';
import { ResidenceOwnerGuard } from './guards/residence-owner.guard';

@Module({
  imports: [CacheConfigModule, LoggingModule],
  controllers: [ResidencesController],
  providers: [ResidencesService, PaginationService, ResidenceOwnerGuard],
  exports: [ResidencesService],
})
export class ResidencesModule {}
