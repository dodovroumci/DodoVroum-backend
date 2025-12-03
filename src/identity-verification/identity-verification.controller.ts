import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IdentityVerificationService } from './identity-verification.service';
import { SubmitIdentityVerificationDto } from './dto/submit-identity-verification.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('identity-verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('identity-verification')
export class IdentityVerificationController {
  constructor(
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  @Post('submit')
  @ApiOperation({ 
    summary: 'Soumettre une demande de vérification d\'identité',
    description: 'Permet à un propriétaire de soumettre ses documents d\'identité pour vérification'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Demande de vérification soumise avec succès' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Seuls les propriétaires peuvent soumettre une vérification' 
  })
  async submitVerification(
    @Request() req: any,
    @Body() submitDto: SubmitIdentityVerificationDto,
  ) {
    return this.identityVerificationService.submitVerification(
      req.user.id,
      submitDto,
    );
  }

  @Get('my-status')
  @ApiOperation({ 
    summary: 'Obtenir mon statut de vérification',
    description: 'Permet à un utilisateur de consulter le statut de sa vérification d\'identité'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Statut de vérification récupéré' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Aucune vérification trouvée' 
  })
  async getMyStatus(@Request() req: any) {
    return this.identityVerificationService.getVerificationStatus(req.user.id);
  }

  @Get('pending')
  @ApiOperation({ 
    summary: 'Obtenir les vérifications en attente (Admin)',
    description: 'Liste toutes les demandes de vérification en attente de traitement'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des vérifications en attente' 
  })
  async getPendingVerifications() {
    return this.identityVerificationService.getPendingVerifications();
  }

  @Get('all')
  @ApiOperation({ 
    summary: 'Obtenir toutes les vérifications (Admin)',
    description: 'Liste toutes les vérifications d\'identité avec filtrage optionnel par statut'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des vérifications' 
  })
  async getAllVerifications() {
    return this.identityVerificationService.getAllVerifications();
  }

  @Patch(':id/status')
  @ApiOperation({ 
    summary: 'Mettre à jour le statut de vérification (Admin)',
    description: 'Permet à un administrateur d\'approuver ou de rejeter une vérification d\'identité'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Statut de vérification mis à jour' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Vérification non trouvée' 
  })
  async updateVerificationStatus(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateDto: UpdateVerificationStatusDto,
  ) {
    return this.identityVerificationService.updateVerificationStatus(
      id,
      req.user.id,
      updateDto,
    );
  }
}

