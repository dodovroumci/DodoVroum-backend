import { LOGIN_THROTTLE_DEFAULTS, loadLoginThrottleConfig } from './auth-throttle.config';
import { AuthModule } from './auth.module';

describe('AuthModule — validation au démarrage', () => {
  const saved = process.env.AUTH_LOGIN_LIMIT;
  afterEach(() => {
    if (saved === undefined) delete process.env.AUTH_LOGIN_LIMIT;
    else process.env.AUTH_LOGIN_LIMIT = saved;
  });

  it('configuration invalide : refus de démarrage avec une erreur explicite', () => {
    process.env.AUTH_LOGIN_LIMIT = 'beaucoup';
    expect(() => new AuthModule().onModuleInit()).toThrow('Configuration invalide : AUTH_LOGIN_LIMIT="beaucoup"');
  });

  it('configuration valide ou absente : démarrage normal', () => {
    delete process.env.AUTH_LOGIN_LIMIT;
    expect(() => new AuthModule().onModuleInit()).not.toThrow();
  });
});

describe('loadLoginThrottleConfig', () => {
  it('variables absentes : valeurs par défaut approuvées (5 tentatives / 300 s)', () => {
    expect(LOGIN_THROTTLE_DEFAULTS).toEqual({ limit: 5, windowSeconds: 300 });
    expect(loadLoginThrottleConfig({})).toEqual({ limit: 5, windowSeconds: 300, windowMs: 300000 });
  });

  it('valeurs valides : lues et converties en millisecondes', () => {
    expect(loadLoginThrottleConfig({ AUTH_LOGIN_LIMIT: '10', AUTH_LOGIN_WINDOW_SECONDS: '900' })).toEqual({
      limit: 10,
      windowSeconds: 900,
      windowMs: 900000,
    });
    expect(loadLoginThrottleConfig({ AUTH_LOGIN_LIMIT: ' 7 ' }).limit).toBe(7);
  });

  it('bornes incluses', () => {
    expect(loadLoginThrottleConfig({ AUTH_LOGIN_LIMIT: '1', AUTH_LOGIN_WINDOW_SECONDS: '1' }).windowMs).toBe(1000);
    expect(loadLoginThrottleConfig({ AUTH_LOGIN_LIMIT: '1000', AUTH_LOGIN_WINDOW_SECONDS: '86400' }).limit).toBe(1000);
  });

  it.each(['', ' ', '0', '-1', '1.5', '5e1', '0x10', 'abc', '1001', '5 tentatives'])(
    'AUTH_LOGIN_LIMIT="%s" : erreur explicite, aucun repli',
    (value) => {
      expect(() => loadLoginThrottleConfig({ AUTH_LOGIN_LIMIT: value })).toThrow(
        `Configuration invalide : AUTH_LOGIN_LIMIT="${value}"`,
      );
    },
  );

  it.each(['', '0', '-60', '300s', '86401', '1e3'])('AUTH_LOGIN_WINDOW_SECONDS="%s" : erreur explicite', (value) => {
    expect(() => loadLoginThrottleConfig({ AUTH_LOGIN_WINDOW_SECONDS: value })).toThrow(
      `Configuration invalide : AUTH_LOGIN_WINDOW_SECONDS="${value}"`,
    );
  });

  it('le message indique les bornes et la valeur par défaut', () => {
    expect(() => loadLoginThrottleConfig({ AUTH_LOGIN_LIMIT: '0' })).toThrow(
      /Entier attendu entre 1 et 1000 \(valeur par défaut si la variable est absente : 5\)/,
    );
  });
});
