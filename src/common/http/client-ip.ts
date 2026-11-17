import { isIP } from 'net';

/**
 * Forme canonique d'une adresse IP pour les compteurs de limitation de débit.
 *
 * - IPv4 : inchangée ; une IPv4 « mappée » (::ffff:1.2.3.4 ou ::ffff:102:304) redevient 1.2.3.4,
 *   pour qu'un même client ne dispose pas de deux compteurs selon la pile réseau.
 * - IPv6 : réduite à son préfixe /64. Un seul abonné dispose en général d'un /64 entier :
 *   compter adresse par adresse lui permettrait de changer d'adresse à chaque tentative.
 * - Valeur absente ou illisible : 'unknown' (compteur commun, jamais d'exception).
 */
export function normalizeIpForRateLimit(ip: unknown): string {
  if (typeof ip !== 'string') return 'unknown';

  // Identifiant de zone (fe80::1%en0) : propre à l'interface locale, sans rapport avec le client.
  const address = ip.trim().split('%')[0];
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return 'unknown';

  const groups = expandIpv6(address);
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === '0000') && groups[5] === 'ffff';
  if (isIpv4Mapped) {
    const high = parseInt(groups[6], 16);
    const low = parseInt(groups[7], 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/** Développe une IPv6 déjà validée par isIP en 8 groupes de 4 chiffres hexadécimaux minuscules. */
function expandIpv6(address: string): string[] {
  let text = address.toLowerCase();

  // Suffixe IPv4 pointé (::ffff:1.2.3.4) : converti en deux groupes hexadécimaux.
  const dottedTail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dottedTail) {
    const [a, b, c, d] = dottedTail.slice(1).map(Number);
    text = `${text.slice(0, dottedTail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, tail] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  if (tail === undefined) return headGroups.map((group) => group.padStart(4, '0'));

  const tailGroups = tail ? tail.split(':') : [];
  const zeros = Array<string>(8 - headGroups.length - tailGroups.length).fill('0');
  return [...headGroups, ...zeros, ...tailGroups].map((group) => group.padStart(4, '0'));
}
