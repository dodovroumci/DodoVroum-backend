/**
 * @file src/auth/auth.service.ts
 * @description Expert Fullstack - Secure Auth Service (Logic delegated to UsersService)
 */

import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: Partial<User>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email.toLowerCase().trim());

    if (!user || !user.isActive) return null;

    // On compare le mot de passe clair reçu avec le hash stocké
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;

    const { password, ...result } = user;
    return result;
  }

  async login(user: any): Promise<LoginResponse> {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      type: 'access'
    };

    const refreshPayload = {
      sub: user.id,
      type: 'refresh'
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
        secret: this.configService.get<string>('JWT_SECRET')
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')
      }),
    ]);

    return { access_token, refresh_token, user };
  }

  /**
   * Register : On délègue tout au UsersService (y compris le hashage)
   */
  async register(registerData: any): Promise<LoginResponse> {
    const existingUser = await this.usersService.findByEmail(registerData.email);
    if (existingUser) throw new BadRequestException('Email déjà utilisé');

    // On passe les données brutes, UsersService.create s'occupe de la sécurité
    const user = await this.usersService.create(registerData);

    return this.login(user);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email.toLowerCase().trim());
    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await this.usersService.update(user.id, {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + 30 * 60 * 1000),
    } as any);

    console.log(`[AUTH] Reset Token pour ${email}: ${resetToken}`);
  }

  /**
   * Reset Password : Le UsersService.update détectera le nouveau password et le hashra
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.usersService.findByResetToken(hashedToken);

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return false;
    }

    await this.usersService.update(user.id, {
      password: newPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    } as any);

    return true;
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) throw new UnauthorizedException();

      const access_token = await this.jwtService.signAsync({
        email: user.email,
        sub: user.id,
        role: user.role,
        type: 'access'
      }, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
        secret: this.configService.get<string>('JWT_SECRET')
      });

      return { access_token };
    } catch {
      throw new UnauthorizedException('Session expirée');
    }
  }

  async logout(userId: string): Promise<void> {
    return;
  }
}
