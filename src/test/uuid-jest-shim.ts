import { randomUUID } from 'node:crypto';

// Substitut de `uuid` sous Jest uniquement (moduleNameMapper "^uuid$" des deux configurations Jest).
// uuid@13 est publié en ESM seul, que le système de modules CommonJS de Jest ne sait pas charger.
// Le code n'utilise que v4 ; randomUUID() produit un UUID version 4 (RFC 9562). Production inchangée.
export const v4 = (): string => randomUUID();
