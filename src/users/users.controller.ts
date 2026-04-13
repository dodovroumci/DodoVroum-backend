import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdentityVerificationService } from '../identity-verification/identity-verification.service';
import { UpdateVerificationStatusDto } from '../identity-verification/dto/update-verification-status.dto';
import { UserRole, VerificationStatus } from '@prisma/client';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les utilisateurs' })
  async findAll(
    @Query('role') role?: string,
    @Query('type') type?: string,
    @Query('isOwner') isOwner?: string,
  ) {
    const filterIsOwner = isOwner === '1' || isOwner === 'true';
    return this.usersService.findAll({
      role,
      type,
      isOwner: isOwner ? filterIsOwner : undefined
    });
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    const { password, ...result } = user;
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({
    summary: 'Mettre à jour un utilisateur',
    description:
      'Un utilisateur connecté ne peut modifier que son propre profil. Les administrateurs peuvent modifier n’importe quel compte.',
  })
  @ApiResponse({ status: 403, description: 'Interdit : ce n’est pas votre compte' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: { user: { id: string; role: UserRole } },
  ) {
    if (req.user.id !== id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Vous n'avez pas l'autorisation de modifier ce profil.");
    }

    const payload = { ...updateUserDto };
    if (req.user.role !== UserRole.ADMIN) {
      delete (payload as Partial<UpdateUserDto>).role;
      delete (payload as Partial<UpdateUserDto>).isVerified;
      delete (payload as Partial<UpdateUserDto>).isActive;
    }

    return this.usersService.update(id, payload);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un utilisateur',
    description:
      'Un utilisateur ne peut supprimer que son propre compte. Les administrateurs peuvent supprimer n’importe quel compte.',
  })
  @ApiResponse({ status: 403, description: 'Interdit : vous ne pouvez supprimer que votre propre compte' })
  async remove(
    @Param('id') id: string,
    @Request() req: { user: { id: string; role: UserRole } },
  ) {
    if (req.user.id !== id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Vous n'êtes pas autorisé à supprimer ce compte.");
    }
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id/identity-verification/approve')
  async approveIdentityVerification(@Param('id') userId: string, @Request() req: any) {
    const updateDto: UpdateVerificationStatusDto = {
      verificationStatus: VerificationStatus.VERIFIED,
    };
    return this.identityVerificationService.updateVerificationStatusByUserId(
      userId,
      req.user.id,
      updateDto,
    );
  }
}
