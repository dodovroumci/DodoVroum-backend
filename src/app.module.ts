import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule'; // ✅ Nouvel import
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SecurityModule } from './security/security.module';
import { AppController } from './app.controller';

// Nouveaux imports métier
import { ResidencesModule } from './residences/residences.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { BookingsModule } from './bookings/bookings.module';
import { OffersModule } from './offers/offers.module';
import { UploadModule } from './upload/upload.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module'; // ✅ Ajoute cette ligne
/**
 * @description Expert Fullstack - Point d'entrée de l'architecture NestJS
 * Centralise les modules globaux, la sécurité et le métier.
 */
@Module({
  imports: [
    // --- 1. CONFIGURATION & SÉCURITÉ ---
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // ✅ Activation du scheduler pour les tâches automatisées (Expirations, etc.)
    ScheduleModule.forRoot(), 
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,

    // --- 2. CORE & AUTH ---
    AuthModule,
    UsersModule,
    SecurityModule,

    // --- 3. MÉTIER & SERVICES ---
    ResidencesModule,
    VehiclesModule,
    BookingsModule,
    OffersModule,
    UploadModule,
    FavoritesModule,
    ReviewsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
