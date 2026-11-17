import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  PartnerResidencesController,
  PublicResidencesController,
} from './partner-api.controllers';
import { PartnerApiKeyGuard } from './partner-api-key.guard';
import { PartnerThrottlerGuard } from './partner-api-throttling';
import { PublicResidencesService } from './public-residences.service';
import { PartnerApiRequestMiddleware } from './request-context';

/**
 * API publique (/api/public/v1) et partenaire (/api/partner/v1) des résidences.
 * Lecture seule : n'importe aucun service d'écriture. Dépend de PrismaModule et
 * ThrottlerModule (globaux, déclarés dans AppModule).
 */
@Module({
  controllers: [PublicResidencesController, PartnerResidencesController],
  providers: [
    PublicResidencesService,
    PartnerApiKeyGuard,
    PartnerThrottlerGuard,
  ],
})
export class PartnerApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(PartnerApiRequestMiddleware)
      .forRoutes(PublicResidencesController, PartnerResidencesController);
  }
}
