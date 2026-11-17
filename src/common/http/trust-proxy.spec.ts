import * as express from 'express';
import * as request from 'supertest';
import { configureTrustProxy, isTrustProxyEnabled } from './trust-proxy';

const logger = () => ({ log: jest.fn(), warn: jest.fn() });

describe('isTrustProxyEnabled', () => {
  it('seules les valeurs exactes "true" et "1" activent le proxy de confiance', () => {
    expect(isTrustProxyEnabled({ TRUST_PROXY: 'true' })).toBe(true);
    expect(isTrustProxyEnabled({ TRUST_PROXY: '1' })).toBe(true);
    for (const value of [undefined, '', 'TRUE', 'yes', '0', 'false', ' true', '2']) {
      expect(isTrustProxyEnabled({ TRUST_PROXY: value })).toBe(false);
    }
  });
});

describe('configureTrustProxy', () => {
  it('activé : trust proxy = 1 et message de démarrage inchangé', () => {
    const app = { set: jest.fn() };
    const log = logger();
    expect(configureTrustProxy(app, { TRUST_PROXY: 'true' }, log)).toBe(true);
    expect(app.set).toHaveBeenCalledTimes(1);
    expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(log.log).toHaveBeenCalledWith('Trust proxy activé (TRUST_PROXY) — IP client fiable pour les webhooks');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('non activé hors production : aucun réglage, aucun message', () => {
    const app = { set: jest.fn() };
    const log = logger();
    expect(configureTrustProxy(app, { NODE_ENV: 'development' }, log)).toBe(false);
    expect(app.set).not.toHaveBeenCalled();
    expect(log.log).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('non activé en production : aucun réglage, avertissement non bloquant', () => {
    const app = { set: jest.fn() };
    const log = logger();
    expect(configureTrustProxy(app, { NODE_ENV: 'production', TRUST_PROXY: 'yes' }, log)).toBe(false);
    expect(app.set).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  describe('IP vue par Express', () => {
    const ipOf = (env: Record<string, string | undefined>, forwardedFor?: string) => {
      const app = express();
      configureTrustProxy(app, env, logger());
      app.get('/', (req, res) => res.json({ ip: req.ip }));
      const call = request(app).get('/');
      return (forwardedFor ? call.set('X-Forwarded-For', forwardedFor) : call).then((res) => res.body.ip);
    };

    it('activé : IP ajoutée par le proxy (dernière entrée), valeur falsifiée par le client ignorée', async () => {
      expect(await ipOf({ TRUST_PROXY: 'true' }, '6.6.6.6, 203.0.113.5')).toBe('203.0.113.5');
      expect(await ipOf({ TRUST_PROXY: '1' }, '203.0.113.5')).toBe('203.0.113.5');
    });

    it('non activé : X-Forwarded-For ignoré, adresse du socket', async () => {
      const socketIp = await ipOf({});
      expect(await ipOf({}, '203.0.113.5')).toBe(socketIp);
      expect(socketIp).not.toBe('203.0.113.5');
    });
  });
});
