import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
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

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email.toLowerCase().trim());
    if (!user || !user.isActive) return null;

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;

    const { password, ...result } = user;
    return result;
  }

  async login(user: any, rememberMe = false): Promise<LoginResponse> {
    const refreshTtl = rememberMe ? '30d' : '1d';
    const [access_token, refresh_token] = await this._generateTokenPair(user, refreshTtl);
    const hash = this._hashToken(refresh_token);

    await this.usersService.updateRefreshTokenHash(user.id, hash);
    this.logger.log(`[LOGIN] user=${user.id} role=${user.role} rememberMe=${rememberMe}`);

    return { access_token, refresh_token, user };
  }

  /**
   * Valide si l'utilisateur possède le rôle requis pour l'application cible.
   * À appeler dans le Controller après l'authentification (req.user), une
   * fois le mot de passe déjà vérifié par LocalStrategy/LocalAuthGuard.
   * ADMIN est toujours autorisé, quelle que soit l'app ciblée.
   */
  async validateAppAccess(user: any, requiredRole: 'CLIENT' | 'PROPRIETAIRE'): Promise<void> {
    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.role === 'ADMIN') {
      return;
    }

    if (user.role !== requiredRole) {
      const message =
        requiredRole === 'CLIENT'
          ? "Accès non autorisé à l'application Client."
          : "Accès non autorisé à l'application Propriétaire.";
      throw new ForbiddenException(message);
    }
  }

  async register(registerData: any): Promise<LoginResponse> {
    const existingUser = await this.usersService.findByEmail(registerData.email);
    if (existingUser) throw new BadRequestException('Email déjà utilisé');

    const user = await this.usersService.create(registerData);
    return this.login(user, false);
  }

  async refreshToken(incomingRefreshToken: string): Promise<RefreshResponse> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(incomingRefreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expirée');
    }

    if (payload?.type !== 'refresh') {
      throw new UnauthorizedException('Token invalide');
    }

    const user = await this.usersService.findByIdForAuth(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Accès refusé');
    }

    if (!user.refreshTokenHash) {
      // Session already invalidated (logout or previous reuse detection)
      throw new UnauthorizedException('Session expirée');
    }

    const incomingHash = this._hashToken(incomingRefreshToken);
    const storedHash = user.refreshTokenHash;

    // Constant-time comparison to prevent timing attacks
    const match =
      incomingHash.length === storedHash.length &&
      crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(storedHash));

    if (!match) {
      // Token reuse detected: invalidate all sessions for this user
      await this.usersService.updateRefreshTokenHash(user.id, null);
      this.logger.warn(`[REFRESH_REUSE] user=${user.id} — all sessions invalidated`);
      throw new UnauthorizedException('Session invalide');
    }

    // Rotate: preserve original rememberMe duration from payload
    const refreshTtl = payload.rememberMe ? '30d' : '1d';
    const [access_token, refresh_token] = await this._generateTokenPair(user, refreshTtl);
    const newHash = this._hashToken(refresh_token);
    await this.usersService.updateRefreshTokenHash(user.id, newHash);

    this.logger.log(`[REFRESH] user=${user.id} — tokens rotated`);
    return { access_token, refresh_token };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshTokenHash(userId, null);
    this.logger.log(`[LOGOUT] user=${userId}`);
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

    // TODO: envoyer resetToken par email (nodemailer / SendGrid)
    // Ne jamais logger le token brut en production
    this.logger.log(`[PASSWORD_RESET_REQUESTED] user=${user.id}`);
  }

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

    // Invalidate all sessions after password reset
    await this.usersService.updateRefreshTokenHash(user.id, null);
    this.logger.log(`[PASSWORD_RESET_DONE] user=${user.id} — all sessions invalidated`);

    return true;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async _generateTokenPair(
    user: { id: string; email: string; role: string },
    refreshExpiresIn: string,
  ): Promise<[string, string]> {
    const rememberMe = refreshExpiresIn === '30d';
    return Promise.all([
      this.jwtService.signAsync(
        { email: user.email, sub: user.id, role: user.role, type: 'access' },
        {
          expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
          secret: this.configService.get<string>('JWT_SECRET'),
        },
      ),
      this.jwtService.signAsync(
        { sub: user.id, type: 'refresh', rememberMe },
        {
          expiresIn: refreshExpiresIn,
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        },
      ),
    ]);
  }

  private _hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
