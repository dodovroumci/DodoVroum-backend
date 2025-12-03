import { Module } from '@nestjs/common';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService, PrismaService],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}

