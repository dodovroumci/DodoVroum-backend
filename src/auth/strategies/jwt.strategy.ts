import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger: Logger;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      const logger = new Logger(JwtStrategy.name);
      logger.error('JWT_SECRET est absent du .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'temporary-fallback-secret-to-prevent-crash',
    });

    this.logger = new Logger(JwtStrategy.name);
  }

  async validate(payload: { sub: string; email: string }) {
    if (!payload?.sub) {
      this.logger.warn('Token invalide: champ "sub" manquant');
      throw new UnauthorizedException('Token invalide');
    }

    // Récupération de l'utilisateur complet en base
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      this.logger.warn(`Token invalide: utilisateur introuvable (sub=${payload.sub})`);
      throw new UnauthorizedException('Accès refusé : utilisateur inexistant');
    }

    if (!user.isActive) {
      this.logger.warn(`Accès refusé: utilisateur inactif (${user.email})`);
      throw new UnauthorizedException('Accès refusé : compte inactif');
    }

    return user;
  }
}
