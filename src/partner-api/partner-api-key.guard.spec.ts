import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  hashPartnerApiKey,
  parsePartnerApiKeys,
  PartnerApiKeyGuard,
} from './partner-api-key.guard';
import { getPartner } from './request-context';

const newKey = () => `dvp_${randomBytes(32).toString('base64url')}`;

describe('Clés d’API partenaires', () => {
  const key = newKey();
  const rotatedKey = newKey();

  const guardWith = (raw: string | undefined) =>
    new PartnerApiKeyGuard({ get: () => raw } as unknown as ConfigService);

  const contextWith = (headers: Record<string, unknown>) => {
    const request = { headers } as never;
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  const expectRejected = (
    guard: PartnerApiKeyGuard,
    headers: Record<string, unknown>,
  ) => {
    const { context, request } = contextWith(headers);
    try {
      guard.canActivate(context);
      fail('refus attendu');
    } catch (error) {
      expect((error as { getStatus(): number }).getStatus()).toBe(401);
      expect((error as { code: string }).code).toBe('INVALID_API_KEY');
    }
    expect(getPartner(request)).toBeUndefined();
  };

  it('format des clés générées : dvp_ + 43 caractères base64url', () => {
    expect(key).toMatch(/^dvp_[A-Za-z0-9_-]{43}$/);
  });

  describe('configuration PARTNER_API_KEYS', () => {
    it('entrées « partenaire:sha256 », plusieurs clés par partenaire (rotation)', () => {
      const { entries, invalid } = parsePartnerApiKeys(
        ` gptdebabi:${hashPartnerApiKey(key)} , gptdebabi:${hashPartnerApiKey(rotatedKey).toUpperCase()}`,
      );
      expect(invalid).toBe(0);
      expect(entries.map((entry) => entry.partnerId)).toEqual([
        'gptdebabi',
        'gptdebabi',
      ]);
    });

    it('entrées mal formées ignorées et comptées (jamais la clé en clair)', () => {
      const { entries, invalid } = parsePartnerApiKeys(
        [
          `gptdebabi:${key}`,
          'sanspoints',
          `:${hashPartnerApiKey(key)}`,
          `Majuscule:${hashPartnerApiKey(key)}`,
          'x:abc',
        ].join(','),
      );
      expect(entries).toEqual([]);
      expect(invalid).toBe(5);
    });

    it('variable absente ou vide → aucune clé', () => {
      expect(parsePartnerApiKeys(undefined)).toEqual({
        entries: [],
        invalid: 0,
      });
      expect(parsePartnerApiKeys(' , ')).toEqual({ entries: [], invalid: 0 });
    });
  });

  describe('PartnerApiKeyGuard', () => {
    const guard = guardWith(
      `gptdebabi:${hashPartnerApiKey(key)},autre:${hashPartnerApiKey(rotatedKey)}`,
    );

    it('clé valide : partenaire identifié', () => {
      const { context, request } = contextWith({ 'x-api-key': key });
      expect(guard.canActivate(context)).toBe(true);
      expect(getPartner(request)).toEqual({ id: 'gptdebabi' });
    });

    it('chaque clé identifie son propre partenaire', () => {
      const { context, request } = contextWith({ 'x-api-key': rotatedKey });
      expect(guard.canActivate(context)).toBe(true);
      expect(getPartner(request)).toEqual({ id: 'autre' });
    });

    it.each([
      ['en-tête absent', {}],
      ['clé inconnue', { 'x-api-key': newKey() }],
      [
        'empreinte envoyée à la place de la clé',
        { 'x-api-key': hashPartnerApiKey(key) },
      ],
      ['clé tronquée', { 'x-api-key': key.slice(0, -1) }],
      ['clé + suffixe', { 'x-api-key': `${key}x` }],
      ['en-tête répété (tableau)', { 'x-api-key': [key, key] }],
      ['jeton Bearer utilisateur', { authorization: `Bearer ${key}` }],
    ])('refus 401 : %s', (_label, headers) => {
      expectRejected(guard, headers);
    });

    it('aucune clé configurée : tout est refusé (fermé par défaut)', () => {
      expectRejected(guardWith(undefined), { 'x-api-key': key });
      expectRejected(guardWith('cassé'), { 'x-api-key': key });
    });
  });
});
