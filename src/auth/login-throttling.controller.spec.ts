import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { loginThrottleKey, loginThrottleTracker } from './decorators/login-throttle.decorator';
import { AuthThrottlerGuard, TOO_MANY_REQUESTS_MESSAGE } from './guards/auth-throttler.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { LocalStrategy } from './strategies/local.strategy';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { configureTrustProxy } from '../common/http/trust-proxy';

/**
 * Limitation des connexions, couche HTTP réelle : AuthController, AuthThrottlerGuard,
 * LocalAuthGuard, LocalStrategy, ValidationPipe et filtre d'erreurs. Seul AuthService est simulé.
 * L'IP du client est fournie par X-Forwarded-For, comme derrière nginx (TRUST_PROXY=true).
 */
const GOOD_PASSWORD = 'bon-mot-de-passe';
const BAD_PASSWORD = 'mauvais-mot-de-passe';
const IP_A = '203.0.113.10';
const IP_B = '198.51.100.20';

const LOGIN_ROUTES = ['/auth/login', '/auth/login/client', '/auth/login/proprio'] as const;

describe('AuthController — limitation des connexions (HTTP)', () => {
  let app: INestApplication;
  let authService: Record<
    'validateUser' | 'login' | 'validateAppAccess' | 'requestPasswordReset' | 'resetPassword' | 'refreshToken' | 'register',
    jest.Mock
  >;
  const CONFIG_VARS = ['AUTH_LOGIN_LIMIT', 'AUTH_LOGIN_WINDOW_SECONDS'] as const;
  const savedConfig = CONFIG_VARS.map((name) => [name, process.env[name]] as const);

  beforeEach(async () => {
    CONFIG_VARS.forEach((name) => delete process.env[name]);

    authService = {
      validateUser: jest.fn(async (email: string, password: string) =>
        password === GOOD_PASSWORD ? { id: `id-${email.toLowerCase().trim()}`, email, role: 'CLIENT' } : null,
      ),
      login: jest.fn(async (user) => ({ access_token: 'access', refresh_token: 'refresh', user })),
      validateAppAccess: jest.fn(async (user, role: string) => {
        if (user.role !== 'ADMIN' && user.role !== role) throw new ForbiddenException('Rôle incompatible');
      }),
      requestPasswordReset: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(true),
      refreshToken: jest.fn().mockResolvedValue({ access_token: 'a', refresh_token: 'r' }),
      register: jest.fn().mockResolvedValue({ access_token: 'a', refresh_token: 'r', user: {} }),
    };

    const moduleRef = await Test.createTestingModule({
      // Limite globale large : seules les limites déclarées sur les routes doivent intervenir.
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }, AuthThrottlerGuard, LocalStrategy],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureTrustProxy(app as NestExpressApplication, { TRUST_PROXY: 'true' }, { log: jest.fn(), warn: jest.fn() });
    // Même configuration que main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    for (const [name, value] of savedConfig) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const post = (path: string, body: Record<string, unknown>, ip = IP_A) =>
    request(app.getHttpServer()).post(path).set('X-Forwarded-For', ip).send(body);
  const login = (email: string, password: string, ip = IP_A, path: string = LOGIN_ROUTES[0]) =>
    post(path, { email, password }, ip);

  /** Épuise le compteur IP + e-mail (5 tentatives par défaut) avec des mots de passe faux. */
  const exhaust = async (email: string, ip = IP_A) => {
    for (let i = 0; i < 5; i++) expect((await login(email, BAD_PASSWORD, ip)).status).toBe(401);
  };

  describe('comptage des tentatives', () => {
    it('5 échecs → 401, la 6e tentative → 429 ; le mot de passe n’est vérifié que 5 fois', async () => {
      await exhaust('awa@test.ci');
      const blocked = await login('awa@test.ci', BAD_PASSWORD);
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toBe(TOO_MANY_REQUESTS_MESSAGE);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(authService.validateUser).toHaveBeenCalledTimes(5);
    });

    it('bon mot de passe pendant le blocage → 429, sans vérification du mot de passe ni connexion', async () => {
      await exhaust('awa@test.ci');
      authService.validateUser.mockClear();
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(429);
      expect(authService.validateUser).not.toHaveBeenCalled();
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('les connexions réussies sont aussi comptées', async () => {
      for (let i = 0; i < 5; i++) expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(200);
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(429);
    });

    it('requête sans e-mail exploitable : comptée elle aussi, puis bloquée', async () => {
      for (let i = 0; i < 5; i++) expect((await post(LOGIN_ROUTES[0], { password: BAD_PASSWORD })).status).toBe(401);
      expect((await post(LOGIN_ROUTES[0], { password: BAD_PASSWORD })).status).toBe(429);
    });
  });

  describe('compteur partagé entre les trois routes de connexion', () => {
    it('tentatives réparties sur /login, /login/client et /login/proprio : un seul compteur', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await login('awa@test.ci', BAD_PASSWORD, IP_A, LOGIN_ROUTES[i % 3])).status).toBe(401);
      }
      for (const path of LOGIN_ROUTES) {
        expect((await login('awa@test.ci', GOOD_PASSWORD, IP_A, path)).status).toBe(429);
      }
      expect(authService.validateUser).toHaveBeenCalledTimes(5);
    });

    it('les trois routes portent exactement la même configuration (gardes dans l’ordre, throttler)', () => {
      const handlers = [AuthController.prototype.login, AuthController.prototype.loginClient, AuthController.prototype.loginProprio];
      for (const handler of handlers) {
        // AuthThrottlerGuard d'abord : la tentative est comptée avant la vérification du mot de passe.
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AuthThrottlerGuard, LocalAuthGuard]);
      }
      const throttlerKeys = Reflect.getMetadataKeys(handlers[0]).filter((key) => String(key).startsWith('THROTTLER:'));
      expect(throttlerKeys.length).toBeGreaterThanOrEqual(4);
      for (const key of throttlerKeys) {
        expect(Reflect.getMetadata(key, handlers[1])).toBe(Reflect.getMetadata(key, handlers[0]));
        expect(Reflect.getMetadata(key, handlers[2])).toBe(Reflect.getMetadata(key, handlers[0]));
      }
    });
  });

  describe('isolation entre utilisateurs et adresses', () => {
    it('même IP : le blocage de A ne bloque pas B', async () => {
      await exhaust('awa@test.ci');
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(429);
      expect((await login('kofi@test.ci', GOOD_PASSWORD)).status).toBe(200);
    });

    it('même e-mail depuis deux IP : compteurs indépendants', async () => {
      await exhaust('awa@test.ci', IP_A);
      expect((await login('awa@test.ci', GOOD_PASSWORD, IP_A)).status).toBe(429);
      expect((await login('awa@test.ci', GOOD_PASSWORD, IP_B)).status).toBe(200);
    });

    it('e-mail normalisé : casse et espaces ne créent pas de nouveau compteur', async () => {
      const variants = ['awa@test.ci', 'AWA@test.ci', ' awa@test.ci', 'Awa@Test.ci ', 'awa@TEST.CI'];
      for (const email of variants) expect((await login(email, BAD_PASSWORD)).status).toBe(401);
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(429);
    });

    it('IPv4 mappée en IPv6 et IPv4 : même compteur', async () => {
      await exhaust('awa@test.ci', `::ffff:${IP_A}`);
      expect((await login('awa@test.ci', GOOD_PASSWORD, IP_A)).status).toBe(429);
    });

    it('IPv6 : adresses du même /64 → même compteur ; autre /64 → compteur indépendant', async () => {
      for (let i = 1; i <= 5; i++) {
        expect((await login('awa@test.ci', BAD_PASSWORD, `2001:db8:1:2::${i}`)).status).toBe(401);
      }
      expect((await login('awa@test.ci', GOOD_PASSWORD, '2001:db8:1:2:aaaa:bbbb:cccc:dddd')).status).toBe(429);
      expect((await login('awa@test.ci', GOOD_PASSWORD, '2001:db8:1:3::1')).status).toBe(200);
    });

    it('aucune limite par IP seule dans ce lot : 31 e-mails différents depuis la même IP passent', async () => {
      for (let i = 0; i < 31; i++) {
        expect((await login(`user${i}@test.ci`, BAD_PASSWORD)).status).toBe(401);
      }
      expect((await login('user31@test.ci', GOOD_PASSWORD)).status).toBe(200);
    });
  });

  describe('isolation avec les autres mécanismes de limitation (inchangés)', () => {
    it('connexion épuisée : forgot-password, register, reset-password et refresh restent disponibles', async () => {
      await exhaust('awa@test.ci');
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(429);

      expect((await post('/auth/forgot-password', { email: 'awa@test.ci' })).status).toBe(200);
      expect(
        (await post('/auth/register', { email: 'awa@test.ci', password: GOOD_PASSWORD, firstName: 'Awa', lastName: 'K' })).status,
      ).toBe(201);
      expect((await post('/auth/reset-password', { token: 'a'.repeat(64), password: 'nouveauMotDePasse' })).status).toBe(200);
      expect((await post('/auth/refresh', { refresh_token: 'jeton' })).status).toBe(200);
    });

    it('forgot-password épuisé (IP + e-mail) : la connexion reste disponible', async () => {
      for (let i = 0; i < 3; i++) expect((await post('/auth/forgot-password', { email: 'awa@test.ci' })).status).toBe(200);
      expect((await post('/auth/forgot-password', { email: 'awa@test.ci' })).status).toBe(429);
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(200);
    });

    it('refresh épuisé (par IP) : la connexion reste disponible', async () => {
      for (let i = 0; i < 10; i++) expect((await post('/auth/refresh', { refresh_token: 'jeton' })).status).toBe(200);
      expect((await post('/auth/refresh', { refresh_token: 'jeton' })).status).toBe(429);
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(200);
    });

    it('register épuisé (IP + e-mail) : la connexion reste disponible', async () => {
      const body = { email: 'awa@test.ci', password: GOOD_PASSWORD, firstName: 'Awa', lastName: 'K' };
      for (let i = 0; i < 3; i++) expect((await post('/auth/register', body)).status).toBe(201);
      expect((await post('/auth/register', body)).status).toBe(429);
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(200);
    });

    it('normalisation IPv6 /64 limitée à la connexion : forgot-password garde un compteur par adresse', async () => {
      for (let i = 0; i < 3; i++) {
        expect((await post('/auth/forgot-password', { email: 'awa@test.ci' }, '2001:db8:1:2::1')).status).toBe(200);
      }
      expect((await post('/auth/forgot-password', { email: 'awa@test.ci' }, '2001:db8:1:2::1')).status).toBe(429);
      // Autre adresse du même /64 : comportement antérieur conservé (compteur distinct).
      expect((await post('/auth/forgot-password', { email: 'awa@test.ci' }, '2001:db8:1:2::2')).status).toBe(200);
    });
  });

  describe('configuration', () => {
    it('AUTH_LOGIN_LIMIT=2 : 429 dès la 3e tentative', async () => {
      process.env.AUTH_LOGIN_LIMIT = '2';
      expect((await login('awa@test.ci', BAD_PASSWORD)).status).toBe(401);
      expect((await login('awa@test.ci', BAD_PASSWORD)).status).toBe(401);
      expect((await login('awa@test.ci', GOOD_PASSWORD)).status).toBe(429);
    });

    it('AUTH_LOGIN_WINDOW_SECONDS appliqué : Retry-After borné par la fenêtre configurée', async () => {
      process.env.AUTH_LOGIN_LIMIT = '1';
      process.env.AUTH_LOGIN_WINDOW_SECONDS = '42';
      expect((await login('awa@test.ci', BAD_PASSWORD)).status).toBe(401);
      const blocked = await login('awa@test.ci', BAD_PASSWORD);
      expect(blocked.status).toBe(429);
      const retryAfter = Number(blocked.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(42);
    });
  });

  describe('comportement d’authentification inchangé', () => {
    it('connexion valide : 200 avec les jetons', async () => {
      const res = await login('awa@test.ci', GOOD_PASSWORD);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ access_token: 'access', refresh_token: 'refresh' });
      expect(authService.login).toHaveBeenCalledWith(expect.objectContaining({ email: 'awa@test.ci' }), false);
    });

    it('identifiants invalides : 401 « Identifiants invalides »', async () => {
      const res = await login('awa@test.ci', BAD_PASSWORD);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Identifiants invalides');
    });

    it('rôle incompatible sur /login/proprio : 403 (contrôle conservé)', async () => {
      const res = await login('awa@test.ci', GOOD_PASSWORD, IP_A, '/auth/login/proprio');
      expect(res.status).toBe(403);
      expect(authService.validateAppAccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'CLIENT' }), 'PROPRIETAIRE');
    });

    it('rememberMe toujours transmis', async () => {
      await post(LOGIN_ROUTES[1], { email: 'awa@test.ci', password: GOOD_PASSWORD, rememberMe: true });
      expect(authService.login).toHaveBeenCalledWith(expect.anything(), true);
    });
  });
});

describe('clé de stockage du compteur de connexion', () => {
  const context = {} as any;

  it('déterministe, SHA-256, sans e-mail en clair', () => {
    const tracker = loginThrottleTracker({ ip: '203.0.113.10', body: { email: 'Awa@Test.ci ' } });
    const key = loginThrottleKey(context, tracker, 'default');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(loginThrottleKey(context, tracker, 'default'));
    expect(key).not.toContain('awa');
  });

  it('suivi : IP normalisée + e-mail normalisé, sans ambiguïté entre les deux', () => {
    expect(loginThrottleTracker({ ip: '::ffff:203.0.113.10', body: { email: ' AWA@test.ci' } })).toBe(
      JSON.stringify(['203.0.113.10', 'awa@test.ci']),
    );
    expect(loginThrottleTracker({ ip: undefined, body: { email: ['x'] } })).toBe(JSON.stringify(['unknown', '']));
  });

  it('distincte selon le throttler et selon le suivi', () => {
    const tracker = loginThrottleTracker({ ip: '203.0.113.10', body: { email: 'awa@test.ci' } });
    expect(loginThrottleKey(context, tracker, 'default')).not.toBe(loginThrottleKey(context, tracker, 'other'));
    expect(loginThrottleKey(context, tracker, 'default')).not.toBe(
      loginThrottleKey(context, loginThrottleTracker({ ip: '203.0.113.11', body: { email: 'awa@test.ci' } }), 'default'),
    );
  });

  it('format différent des clés MD5 (32 caractères) des autres limites : aucune collision possible', () => {
    const otherRouteKey = createHash('md5').update('AuthController-forgotPassword-default-203.0.113.10-awa@test.ci').digest('hex');
    expect(otherRouteKey).toHaveLength(32);
    expect(loginThrottleKey(context, 'x', 'default')).toHaveLength(64);
  });
});
