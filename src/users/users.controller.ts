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
  Query
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
import { VerificationStatus } from '@prisma/client';

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
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  remove(@Param('id') id: string) {
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
