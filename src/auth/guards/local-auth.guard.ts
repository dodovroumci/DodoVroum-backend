import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Si une erreur est levée ou qu'aucun utilisateur n'est trouvé
    if (err || !user) {
      // Si c'est déjà une UnauthorizedException, la relancer
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      // Sinon, créer une UnauthorizedException
      throw new UnauthorizedException('Identifiants invalides');
    }
    return user;
  }
}
