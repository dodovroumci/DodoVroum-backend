import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IdentityVerificationService } from './identity-verification.service';
import { SubmitIdentityVerificationDto } from './dto/submit-identity-verification.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerificationStatus } from '@prisma/client';

@ApiTags('identity-verification')
@Controller('identity-verification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IdentityVerificationController {
  constructor(
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  @Post('submit')
  @ApiOperation({ summary: 'Soumettre ses pièces d’identité' })
  async submit(@Request() req: any, @Body() dto: SubmitIdentityVerificationDto) {
    return this.identityVerificationService.submitVerification(req.user.id, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Voir mon statut de vérification' })
  async getStatus(@Request() req: any) {
    return this.identityVerificationService.getVerificationStatus(req.user.id);
  }

  @Get('admin/all')
  @ApiOperation({ summary: 'Admin : Voir toutes les vérifications' })
  async getAll(@Query('status') status?: VerificationStatus) {
    // Utilise la méthode getPendingVerifications ou crée une méthode générique
    return this.identityVerificationService.getPendingVerifications();
  }

  @Patch('admin/verify/:userId')
  @ApiOperation({ summary: 'Admin : Approuver ou rejeter par User ID' })
  async verifyUser(
    @Param('userId') userId: string,
    @Request() req: any,
    @Body() dto: UpdateVerificationStatusDto,
  ) {
    // Utilise la nouvelle méthode avec Auto-Healing
    return this.identityVerificationService.updateVerificationStatusByUserId(
      userId,
      req.user.id,
      dto,
    );
  }
}
