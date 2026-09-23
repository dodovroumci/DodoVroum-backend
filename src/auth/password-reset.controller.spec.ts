import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import {
  AuthController,
  PASSWORD_RESET_DONE_MESSAGE,
  PASSWORD_RESET_INVALID_TOKEN_MESSAGE,
  PASSWORD_RESET_REQUESTED_MESSAGE,
} from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottlerGuard, TOO_MANY_REQUESTS_MESSAGE } from './guards/auth-throttler.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';

/**
 * Couche HTTP réelle (validation, throttler, filtre d'erreurs) ; AuthService simulé.
 */
describe('AuthController — mot de passe oublié (HTTP)', () => {
  let app: INestApplication;
  let authService: { requestPasswordReset: jest.Mock; resetPassword: jest.Mock };

  beforeEach(async () => {
    authService = {
      requestPasswordReset: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(true),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }, AuthThrottlerGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    // Même configuration que main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(() => app.close());

  const forgot = (email: unknown) =>
    request(app.getHttpServer()).post('/auth/forgot-password').send({ email });
  const reset = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/auth/reset-password').send(body);

  describe('POST /auth/forgot-password', () => {
    it('réponse neutre identique, que le compte existe ou non', async () => {
      authService.requestPasswordReset
        .mockResolvedValueOnce(undefined) // compte existant
        .mockResolvedValueOnce(undefined); // compte inexistant

      const existing = await forgot('awa@test.ci');
      const unknown = await forgot('inconnu@test.ci');

      expect(existing.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(existing.body).toEqual({ message: PASSWORD_RESET_REQUESTED_MESSAGE });
      expect(unknown.body).toEqual(existing.body);
    });

    it('n\'attend pas l\'envoi : un échec SMTP ne change pas la réponse', async () => {
      authService.requestPasswordReset.mockRejectedValueOnce(new Error('SMTP down'));
      const res = await forgot('awa@test.ci');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: PASSWORD_RESET_REQUESTED_MESSAGE });
    });

    it('email invalide : 400, aucun traitement', async () => {
      const res = await forgot('pas-un-email');
      expect(res.status).toBe(400);
      expect(authService.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('limite IP + email dépassée : HTTP 429 avec message clair', async () => {
      for (let i = 0; i < 3; i++) {
        expect((await forgot('awa@test.ci')).status).toBe(200);
      }
      const blocked = await forgot('AWA@test.ci'); // casse différente : même compteur
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toBe(TOO_MANY_REQUESTS_MESSAGE);
      expect(authService.requestPasswordReset).toHaveBeenCalledTimes(3);
    });

    it('limite par IP : impossible d\'enchaîner les adresses', async () => {
      for (let i = 0; i < 10; i++) {
        expect((await forgot(`user${i}@test.ci`)).status).toBe(200);
      }
      const blocked = await forgot('user10@test.ci');
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    });
  });

  describe('POST /auth/reset-password', () => {
    const token = 'a'.repeat(64);

    it('succès : message de confirmation', async () => {
      const res = await reset({ token, password: 'nouveauMotDePasse' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: PASSWORD_RESET_DONE_MESSAGE });
      expect(authService.resetPassword).toHaveBeenCalledWith(token, 'nouveauMotDePasse');
    });

    it('token invalide / expiré / déjà utilisé : 400 avec un message unique', async () => {
      authService.resetPassword.mockResolvedValue(false);
      const res = await reset({ token, password: 'nouveauMotDePasse' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(PASSWORD_RESET_INVALID_TOKEN_MESSAGE);
    });

    it('mot de passe de moins de 8 caractères : 400, service non appelé', async () => {
      const res = await reset({ token, password: 'court12' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('au moins 8 caractères');
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('token manquant : 400 avec le message unique', async () => {
      const res = await reset({ token: '', password: 'nouveauMotDePasse' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(PASSWORD_RESET_INVALID_TOKEN_MESSAGE);
    });

    it('champ inattendu refusé (forbidNonWhitelisted)', async () => {
      const res = await reset({ token, password: 'nouveauMotDePasse', role: 'ADMIN' });
      expect(res.status).toBe(400);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('passwordConfirmation refusé : le contrat est { token, password } uniquement', async () => {
      const res = await reset({
        token,
        password: 'nouveauMotDePasse',
        passwordConfirmation: 'nouveauMotDePasse',
      });
      expect(res.status).toBe(400);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('brute-force limité : HTTP 429 après 10 tentatives', async () => {
      authService.resetPassword.mockResolvedValue(false);
      for (let i = 0; i < 10; i++) {
        expect((await reset({ token: `${i}`.padEnd(64, 'b'), password: 'nouveauMotDePasse' })).status).toBe(400);
      }
      const blocked = await reset({ token, password: 'nouveauMotDePasse' });
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    });
  });
});
