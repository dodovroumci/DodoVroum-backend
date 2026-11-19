import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { Request } from 'express';
import * as request from 'supertest';
import { GeniusPayWebhookIpGuard, getClientIp } from './geniuspay-webhook-ip.guard';

const ALLOWED = '203.0.113.10';
const OTHER = '198.51.100.7';

function guardWith(allowedIps: string): GeniusPayWebhookIpGuard {
  const config = {
    get: (key: string) => (key === 'GENIUSPAY_WEBHOOK_ALLOWED_IPS' ? allowedIps : undefined),
  } as unknown as ConfigService;
  return new GeniusPayWebhookIpGuard(config);
}

function contextFor(req: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

/** Requête minimale : seul req.ip doit compter, en-têtes et socket sont des leurres. */
function fakeRequest(ip: string | undefined): Request {
  return {
    ip,
    headers: { 'x-forwarded-for': ALLOWED },
    socket: { remoteAddress: ALLOWED },
  } as unknown as Request;
}

describe('GeniusPayWebhookIpGuard — IP du client', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('getClientIp retient req.ip, jamais X-Forwarded-For ni l’adresse du socket', () => {
    expect(getClientIp(fakeRequest(OTHER))).toBe(OTHER);
    expect(() => guardWith(ALLOWED).canActivate(contextFor(fakeRequest(OTHER)))).toThrow(
      ForbiddenException,
    );
  });

  it('IPv4 mappée en IPv6 (::ffff:a.b.c.d) normalisée puis comparée à la whitelist', () => {
    expect(getClientIp(fakeRequest(`::ffff:${ALLOWED}`))).toBe(ALLOWED);
    expect(guardWith(ALLOWED).canActivate(contextFor(fakeRequest(`::ffff:${ALLOWED}`)))).toBe(true);
  });

  it.each([undefined, ''])('IP absente (%p) avec whitelist active : refusée (403)', (ip) => {
    expect(() => guardWith(ALLOWED).canActivate(contextFor(fakeRequest(ip)))).toThrow(
      ForbiddenException,
    );
  });

  it('whitelist vide : comportement inchangé, accepté avec avertissement', () => {
    expect(guardWith('').canActivate(contextFor(fakeRequest(OTHER)))).toBe(true);
  });

  describe('derrière nginx (Express réel, trust proxy = 1)', () => {
    // nginx ($proxy_add_x_forwarded_for) ajoute l'IP réelle en dernière position.
    const app = express();
    app.set('trust proxy', 1);
    app.post('/webhook', (req, res) => {
      try {
        guardWith(ALLOWED).canActivate(contextFor(req));
        res.status(200).json({ ip: getClientIp(req) });
      } catch (e) {
        res.status(e instanceof ForbiddenException ? 403 : 500).json({ ip: getClientIp(req) });
      }
    });

    it('X-Forwarded-For falsifié (IP autorisée en tête) : ignoré, l’IP ajoutée par nginx est retenue', async () => {
      const res = await request(app)
        .post('/webhook')
        .set('X-Forwarded-For', `${ALLOWED}, ${OTHER}`)
        .expect(403);
      expect(res.body.ip).toBe(OTHER);
    });

    it('IP réelle autorisée ajoutée par nginx : acceptée, quel que soit le contenu fourni par l’appelant', async () => {
      const res = await request(app)
        .post('/webhook')
        .set('X-Forwarded-For', `${OTHER}, ${ALLOWED}`)
        .expect(200);
      expect(res.body.ip).toBe(ALLOWED);
    });
  });
});
