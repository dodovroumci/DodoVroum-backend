import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function contextWithUser(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard — cloisonnement des rôles', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('rejette une requête sans utilisateur authentifié', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });

  it('rejette un compte PROPRIETAIRE tentant d\'accéder à une route admin', () => {
    expect(() => guard.canActivate(contextWithUser({ id: 'owner-1', role: 'PROPRIETAIRE' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejette un compte CLIENT tentant d\'accéder à une route admin', () => {
    expect(() => guard.canActivate(contextWithUser({ id: 'client-1', role: 'CLIENT' }))).toThrow(
      ForbiddenException,
    );
  });

  it('autorise un compte ADMIN', () => {
    expect(guard.canActivate(contextWithUser({ id: 'admin-1', role: 'ADMIN' }))).toBe(true);
  });
});
