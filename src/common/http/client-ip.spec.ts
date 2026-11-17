import { normalizeIpForRateLimit } from './client-ip';

describe('normalizeIpForRateLimit', () => {
  it('IPv4 : inchangée', () => {
    expect(normalizeIpForRateLimit('203.0.113.5')).toBe('203.0.113.5');
    expect(normalizeIpForRateLimit(' 203.0.113.5 ')).toBe('203.0.113.5');
  });

  it('IPv4 mappée en IPv6 (forme pointée ou hexadécimale) : même valeur que l’IPv4', () => {
    expect(normalizeIpForRateLimit('::ffff:203.0.113.5')).toBe('203.0.113.5');
    expect(normalizeIpForRateLimit('::FFFF:203.0.113.5')).toBe('203.0.113.5');
    expect(normalizeIpForRateLimit('::ffff:cb00:7105')).toBe('203.0.113.5');
    expect(normalizeIpForRateLimit('0:0:0:0:0:ffff:cb00:7105')).toBe('203.0.113.5');
    expect(normalizeIpForRateLimit('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('IPv6 : deux adresses du même /64 donnent la même valeur', () => {
    const a = normalizeIpForRateLimit('2001:db8:1:2::a');
    const b = normalizeIpForRateLimit('2001:db8:1:2:ffff:ffff:ffff:ffff');
    expect(a).toBe('2001:0db8:0001:0002::/64');
    expect(b).toBe(a);
  });

  it('IPv6 : deux /64 différents donnent des valeurs différentes', () => {
    expect(normalizeIpForRateLimit('2001:db8:1:2::a')).not.toBe(normalizeIpForRateLimit('2001:db8:1:3::a'));
  });

  it('IPv6 : formes compressée, développée et en majuscules équivalentes', () => {
    const expected = '2001:0db8:0000:0000::/64';
    expect(normalizeIpForRateLimit('2001:db8::1')).toBe(expected);
    expect(normalizeIpForRateLimit('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe(expected);
    expect(normalizeIpForRateLimit('2001:db8:0:0:1::')).toBe(expected);
  });

  it('IPv6 : cas limites (::, ::1, zone, suffixe IPv4 non mappé)', () => {
    expect(normalizeIpForRateLimit('::')).toBe('0000:0000:0000:0000::/64');
    expect(normalizeIpForRateLimit('::1')).toBe('0000:0000:0000:0000::/64');
    expect(normalizeIpForRateLimit('fe80::1%en0')).toBe('fe80:0000:0000:0000::/64');
    expect(normalizeIpForRateLimit('64:ff9b::203.0.113.5')).toBe('0064:ff9b:0000:0000::/64');
  });

  it('valeur absente ou illisible : "unknown", sans exception', () => {
    for (const value of [undefined, null, 42, {}, '', 'pas-une-ip', '999.1.1.1', '1.2.3', '2001:db8:::1']) {
      expect(normalizeIpForRateLimit(value)).toBe('unknown');
    }
  });
});
