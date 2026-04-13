import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';

@Module({
  imports: [IdentityVerificationModule],
  controllers: [UsersController], // <-- DOIT ÊTRE PRÉSENT
  providers: [UsersService],
  exports: [UsersService], // Pour que l'AuthService puisse l'utiliser
})
export class UsersModule {}
