import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PartnerGuard } from './partner.guard';

function contextWithUser(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PartnerGuard', () => {
  let guard: PartnerGuard;

  beforeEach(() => {
    guard = new PartnerGuard();
  });

  it('rejette un utilisateur non authentifié', () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });

  it('rejette un compte CLIENT — un client ne doit pas pouvoir créer une annonce', () => {
    expect(() => guard.canActivate(contextWithUser({ id: 'u1', role: 'CLIENT' }))).toThrow(
      ForbiddenException,
    );
  });

  it('autorise un compte PROPRIETAIRE', () => {
    expect(guard.canActivate(contextWithUser({ id: 'u1', role: 'PROPRIETAIRE' }))).toBe(true);
  });

  it('autorise un compte ADMIN', () => {
    expect(guard.canActivate(contextWithUser({ id: 'u1', role: 'ADMIN' }))).toBe(true);
  });

  it('rejette un rôle en minuscules mal formé (normalisation) — sécurité par défaut', () => {
    // Le rôle stocké en base est toujours en majuscules (enum Prisma) ; un rôle
    // inattendu ne doit jamais passer silencieusement.
    expect(() => guard.canActivate(contextWithUser({ id: 'u1', role: 'unknown' }))).toThrow(
      ForbiddenException,
    );
  });
});
