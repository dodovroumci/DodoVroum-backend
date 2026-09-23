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
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginResponse, RefreshResponse } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthIpThrottle, AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterProprietaireDto } from './dto/register-proprietaire.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export const PASSWORD_RESET_REQUESTED_MESSAGE =
  'Si un compte est associé à cette adresse, vous recevrez un email avec les instructions.';
export const PASSWORD_RESET_INVALID_TOKEN_MESSAGE =
  'Ce lien est invalide ou a expiré. Demandez-en un nouveau.';
export const PASSWORD_RESET_DONE_MESSAGE =
  'Votre mot de passe a été réinitialisé. Vous pouvez vous connecter.';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard, AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  async login(@Request() req, @Body() loginDto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(req.user, loginDto.rememberMe ?? false);
  }

  @UseGuards(LocalAuthGuard, AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('login/client')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur (application Client)' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({ status: 403, description: "Rôle incompatible avec l'application Client" })
  async loginClient(@Request() req, @Body() loginDto: LoginDto): Promise<LoginResponse> {
    await this.authService.validateAppAccess(req.user, 'CLIENT');
    return this.authService.login(req.user, loginDto.rememberMe ?? false);
  }

  @UseGuards(LocalAuthGuard, AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('login/proprio')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur (application Propriétaire)' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({ status: 403, description: "Rôle incompatible avec l'application Propriétaire" })
  async loginProprio(@Request() req, @Body() loginDto: LoginDto): Promise<LoginResponse> {
    await this.authService.validateAppAccess(req.user, 'PROPRIETAIRE');
    return this.authService.login(req.user, loginDto.rememberMe ?? false);
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
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('register/proprietaire')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Auto-inscription propriétaire (public, rôle PROPRIETAIRE forcé côté serveur)' })
  @ApiBody({ type: RegisterProprietaireDto })
  @ApiResponse({ status: 201, description: 'Inscription réussie, connexion automatique' })
  @ApiResponse({ status: 400, description: 'Données invalides ou contrat non accepté' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  async registerProprietaire(@Body() dto: RegisterProprietaireDto): Promise<LoginResponse> {
    return this.authService.registerProprietaire(dto);
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @AuthIpThrottle({ limit: 10, ttl: 600000 })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander une réinitialisation de mot de passe' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    // Traitement (lookup, token, SMTP) en arrière-plan : réponse et durée
    // identiques que le compte existe ou non.
    this.authService.requestPasswordReset(dto.email).catch((error) =>
      this.logger.error(`[PASSWORD_RESET_REQUEST_FAILED] ${error?.message ?? error}`),
    );
    return { message: PASSWORD_RESET_REQUESTED_MESSAGE };
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe via le token' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const success = await this.authService.resetPassword(dto.token, dto.password);
    if (!success) {
      // Même message pour un token invalide, expiré ou déjà utilisé.
      throw new BadRequestException(PASSWORD_RESET_INVALID_TOKEN_MESSAGE);
    }
    return { message: PASSWORD_RESET_DONE_MESSAGE };
  }

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir les tokens (rotation)' })
  @ApiBody({ type: RefreshTokenDto })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshResponse> {
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
