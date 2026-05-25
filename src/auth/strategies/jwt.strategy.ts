import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required — refusing to start');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; type?: string }) {
    if (!payload?.sub) {
      this.logger.warn('Token invalide: champ "sub" manquant');
      throw new UnauthorizedException('Token invalide');
    }

    // Reject refresh tokens used as access tokens
    if (payload.type !== 'access') {
      this.logger.warn(`Token type incorrect (sub=${payload.sub}, type=${payload.type})`);
      throw new UnauthorizedException('Token invalide');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      this.logger.warn(`Utilisateur introuvable (sub=${payload.sub})`);
      throw new UnauthorizedException('Accès refusé : utilisateur inexistant');
    }

    if (!user.isActive) {
      this.logger.warn(`Compte inactif (${user.email})`);
      throw new UnauthorizedException('Accès refusé : compte inactif');
    }

    return user;
  }
}
