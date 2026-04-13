import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

/**
 * Stratégie JWT avec logging de debug pour identifier les problèmes de rôles.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error('❌ ERREUR CRITIQUE: JWT_SECRET est absent du .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'temporary-fallback-secret-to-prevent-crash',
    });
  }

  async validate(payload: { sub: string; email: string }) {
    console.log('--- [JWT DEBUG] Début Validation Token ---');
    
    if (!payload?.sub) {
      console.error('❌ [JWT DEBUG] Payload manquant ou "sub" absent');
      throw new UnauthorizedException('Token invalide');
    }

    // Récupération de l'utilisateur complet en base
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      console.error(`❌ [JWT DEBUG] Utilisateur avec ID ${payload.sub} non trouvé en base`);
      throw new UnauthorizedException('Accès refusé : utilisateur inexistant');
    }

    if (!user.isActive) {
      console.warn(`⚠️ [JWT DEBUG] Utilisateur ${user.email} est inactif`);
      throw new UnauthorizedException('Accès refusé : compte inactif');
    }

    // LOG CRUCIAL : On vérifie la structure de l'objet user
    console.log(`✅ [JWT DEBUG] User trouvé: ${user.email}`);
    console.log(`🆔 [JWT DEBUG] User ID: ${user.id}`);
    console.log(`🛡️ [JWT DEBUG] User Role: ${user.role}`); // C'est ici que ça se joue
    console.log('--- [JWT DEBUG] Fin Validation ---');

    return user;
  }
}
