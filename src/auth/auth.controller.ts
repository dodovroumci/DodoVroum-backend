/**
 * @file src/auth/auth.controller.ts
 * @description Expert Fullstack - Auth Controller with Password Recovery (FIXED)
 */

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginResponse } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard, AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  async login(@Request() req): Promise<LoginResponse> {
    return this.authService.login(req.user);
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Inscription utilisateur' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Inscription réussie' })
  async register(@Body() registerDto: RegisterDto): Promise<LoginResponse> {
    return this.authService.register(registerDto);
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander une réinitialisation de mot de passe' })
  async forgotPassword(@Body('email') email: string) {
    if (!email) throw new BadRequestException('L\'email est requis');
    await this.authService.requestPasswordReset(email);
    return {
      message: 'Si cet email correspond à un compte, vous recevrez un lien de réinitialisation sous peu.'
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe via le token' })
  async resetPassword(
    @Body('token') token: string,
    @Body('password') pass: string
  ) {
    if (!token || !pass) throw new BadRequestException('Token et nouveau mot de passe requis');

    const success = await this.authService.resetPassword(token, pass);
    if (!success) {
      throw new BadRequestException('Le lien de récupération est invalide ou a expiré');
    }
    return { message: 'Votre mot de passe a été mis à jour avec succès.' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir le token d\'accès' })
  @ApiBody({ type: RefreshTokenDto })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<{ access_token: string }> {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtenir le profil de l\'utilisateur connecté' })
  async getMe(@Request() req): Promise<any> {
    const { password, resetPasswordToken, resetPasswordExpires, ...user } = req.user;
    return user;
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion utilisateur' })
  async logout(@Request() req): Promise<{ message: string }> {
    await this.authService.logout(req.user.id);
    return { message: 'Déconnexion réussie' };
  }
}
