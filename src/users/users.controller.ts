import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdentityVerificationService } from '../identity-verification/identity-verification.service';
import { UpdateVerificationStatusDto } from '../identity-verification/dto/update-verification-status.dto';
import { VerificationStatus } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer un utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les utilisateurs' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs' })
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id/identity-verification/approve')
  @ApiOperation({ 
    summary: 'Approuver la vérification d\'identité d\'un utilisateur (Admin)',
    description: 'Permet à un administrateur d\'approuver la vérification d\'identité d\'un utilisateur'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Vérification d\'identité approuvée avec succès' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Vérification d\'identité non trouvée' 
  })
  async approveIdentityVerification(
    @Param('id') userId: string,
    @Request() req: any,
  ) {
    const updateDto: UpdateVerificationStatusDto = {
      verificationStatus: VerificationStatus.VERIFIED,
    };
    return this.identityVerificationService.updateVerificationStatusByUserId(
      userId,
      req.user.id,
      updateDto,
    );
  }

  @Patch(':id/identity-verification/reject')
  @ApiOperation({ 
    summary: 'Rejeter la vérification d\'identité d\'un utilisateur (Admin)',
    description: 'Permet à un administrateur de rejeter la vérification d\'identité d\'un utilisateur'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Vérification d\'identité rejetée' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Vérification d\'identité non trouvée' 
  })
  async rejectIdentityVerification(
    @Param('id') userId: string,
    @Request() req: any,
    @Body() body: { rejectionReason?: string },
  ) {
    const updateDto: UpdateVerificationStatusDto = {
      verificationStatus: VerificationStatus.REJECTED,
      rejectionReason: body.rejectionReason,
    };
    return this.identityVerificationService.updateVerificationStatusByUserId(
      userId,
      req.user.id,
      updateDto,
    );
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obtenir un utilisateur par ID',
    description: 'Récupère un utilisateur avec toutes ses résidences et véhicules actifs inclus automatiquement'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Utilisateur trouvé avec ses résidences et véhicules' 
  })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur supprimé' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
