import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ResidencesModule } from './residences/residences.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { OffersModule } from './offers/offers.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FavoritesModule } from './favorites/favorites.module';
import { SearchModule } from './search/search.module';
import { IdentityVerificationModule } from './identity-verification/identity-verification.module';
import { UploadModule } from './upload/upload.module';
import { AdminModule } from './admin/admin.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { CacheConfigModule } from './cache/cache.module';
import { LoggingModule } from './logging/logging.module';
import { SecurityModule } from './security/security.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    // Configuration globale
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requêtes par minute
      },
    ]),
    
    // Modules de monitoring et sécurité
    MonitoringModule,
    CacheConfigModule,
    LoggingModule,
    SecurityModule,
    
    // Base de données
    PrismaModule,
    
    // Modules métier
    AuthModule,
    UsersModule,
    ResidencesModule,
    VehiclesModule,
    OffersModule,
    BookingsModule,
    PaymentsModule,
    ReviewsModule,
    FavoritesModule,
    SearchModule,
    IdentityVerificationModule,
    UploadModule,
    AdminModule,
    NotificationsModule,
  ],
})
export class AppModule {}
