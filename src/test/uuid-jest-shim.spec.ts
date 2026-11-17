/**
 * Substitut Jest de `uuid` (uuid@13 est ESM seul) : le mapping "^uuid$" est actif et reproduit uuid.v4.
 */
import * as uuid from 'uuid';
import * as shim from './uuid-jest-shim';

// RFC 9562 : version 4 (13e chiffre hexadécimal) et variante RFC (17e chiffre parmi 8, 9, a, b).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid sous Jest', () => {
  it("l'import de 'uuid' est résolu vers le substitut", () => {
    expect(uuid.v4).toBe(shim.v4);
  });

  it('v4() produit des UUID version 4, variante RFC, en minuscules, tous distincts', () => {
    const ids = Array.from({ length: 1000 }, () => uuid.v4());
    ids.forEach((id) => expect(id).toMatch(UUID_V4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("les modules d'upload qui importent uuid se chargent sous Jest", () => {
    expect(() => require('../upload/upload.service')).not.toThrow();
    expect(() => require('../upload/upload.controller')).not.toThrow();
  });
});
