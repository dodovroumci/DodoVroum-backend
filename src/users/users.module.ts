import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';

@Module({
  imports: [IdentityVerificationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
