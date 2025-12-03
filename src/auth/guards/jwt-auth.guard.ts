import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    // Vérifier si le token est fourni
    if (!authHeader) {
      throw new UnauthorizedException('Token d\'authentification manquant. Veuillez fournir un token Bearer dans l\'en-tête Authorization.');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Format de token invalide. Utilisez le format: Bearer <token>');
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Gérer les erreurs spécifiques
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expiré. Veuillez vous reconnecter.');
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Token invalide. Veuillez vous reconnecter.');
      }
      if (info?.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token pas encore valide.');
      }
      throw new UnauthorizedException('Authentification requise. Veuillez vous connecter.');
    }
    return user;
  }
}
