/**
 * Garde de la base de test e2e (module sans effet de bord, importable partout).
 *
 * Les tests e2e écrivent dans la base et y suppriment des données (TestUtils.cleanupTestData).
 * Ils n'acceptent donc qu'une base MySQL locale nommée exactement `dodo_vroum_test`, fournie
 * par la variable dédiée TEST_DATABASE_URL — jamais par DATABASE_URL ni par le fichier .env.
 * Ces contrôles ne doivent jamais être assouplis ou contournés pour faire passer un test.
 */
export const TEST_DATABASE_NAME = 'dodo_vroum_test';

// Poste local, et service MySQL de GitHub Actions (port publié sur le runner).
const ALLOWED_TEST_DATABASE_HOSTS = ['127.0.0.1', 'localhost'];

// Seuls des réglages de pool et de délais sont admis : tout autre paramètre est refusé, notamment
// `socket`, qui remplace l'hôte et permettrait de contourner le contrôle ci-dessus.
const ALLOWED_TEST_DATABASE_PARAMS = ['connection_limit', 'connect_timeout', 'pool_timeout', 'socket_timeout'];

// Emplacement de l'URL validée sur le contexte global du fichier de test (propre à chaque fichier sous Jest).
// Seul setup-e2e.ts l'enregistre : sous la configuration unitaire, il reste toujours vide.
const VALIDATED_URL_KEY = Symbol.for('dodovroum.test.validatedTestDatabaseUrl');

/**
 * Vérifie qu'une URL désigne la base de test isolée et la renvoie telle quelle.
 * Les messages d'erreur ne reprennent jamais l'URL complète (elle contient un mot de passe).
 */
export function assertSafeTestDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error(
      `TEST_DATABASE_URL est obligatoire pour les tests e2e (base MySQL locale "${TEST_DATABASE_NAME}"). ` +
        'DATABASE_URL et .env ne sont jamais utilisés comme repli.',
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL invalide : URL illisible.');
  }

  if (url.protocol !== 'mysql:') {
    throw new Error(`TEST_DATABASE_URL refusée : protocole "${url.protocol}" (seul "mysql:" est accepté).`);
  }
  if (!ALLOWED_TEST_DATABASE_HOSTS.includes(url.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL refusée : hôte "${url.hostname}" non autorisé (${ALLOWED_TEST_DATABASE_HOSTS.join(', ')}).`,
    );
  }
  const forbiddenParams = [...url.searchParams.keys()].filter((key) => !ALLOWED_TEST_DATABASE_PARAMS.includes(key));
  if (forbiddenParams.length > 0) {
    throw new Error(
      `TEST_DATABASE_URL refusée : paramètre(s) "${forbiddenParams.join('", "')}" non autorisé(s) ` +
        `(${ALLOWED_TEST_DATABASE_PARAMS.join(', ')}).`,
    );
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `TEST_DATABASE_URL refusée : base "${databaseName}" (seule "${TEST_DATABASE_NAME}" est acceptée).`,
    );
  }

  return rawUrl;
}

// Au niveau base, MySQL interprète `_` et `%` comme des jokers : seul le nom échappé désigne
// exactement `dodo_vroum_test` (`dodo_vroum_test`.* couvrirait aussi `dodoXvroumYtest`, `dodo-vroum-test`…).
const TEST_DATABASE_GRANT_SCOPE = `\`${TEST_DATABASE_NAME.replace(/_/g, '\\_')}\`.*`;
// Au niveau table, le nom de base est littéral (aucun joker) : seule la forme non échappée est la base exacte.
const TEST_TABLE_GRANT_SCOPE = new RegExp(`^\`${TEST_DATABASE_NAME}\`\\.\`(?:[^\`]|\`\`)+\`$`);

/**
 * Indique si une ligne de `SHOW GRANTS` reste dans le périmètre autorisé des identifiants de test :
 * `USAGE` (aucun droit) au niveau global, droits sur la base exacte `dodo\_vroum\_test`.* (forme créée
 * par l'image Docker MySQL), ou droits sur une table de cette base. Tout le reste est refusé : droits
 * globaux, autres bases, motifs à jokers (dont le nom non échappé), rôles, PROXY, routines, ligne illisible.
 */
export function isAllowedTestDatabaseGrant(grant: string): boolean {
  const match = /^GRANT (.+) ON (\S+) TO /i.exec(grant.trim());
  if (!match) return false;
  const [, privileges, scope] = match;

  if (scope === '*.*') return privileges.trim().toUpperCase() === 'USAGE';

  return scope === TEST_DATABASE_GRANT_SCOPE || TEST_TABLE_GRANT_SCOPE.test(scope);
}

/**
 * Valide l'URL puis l'enregistre, en lecture seule, comme base de test du fichier courant.
 * Réservé à setup-e2e.ts. Lève une erreur sans rien enregistrer si l'URL n'est pas conforme.
 */
export function registerTestDatabaseUrl(rawUrl: string | undefined): string {
  const url = assertSafeTestDatabaseUrl(rawUrl);
  Object.defineProperty(globalThis, VALIDATED_URL_KEY, { value: url, writable: false, configurable: false });
  return url;
}

/**
 * URL de la base de test enregistrée par setup-e2e.ts, revalidée à chaque appel.
 * Lève une erreur si aucune URL n'a été enregistrée : aucune opération sur une base n'est alors autorisée.
 */
export function getValidatedTestDatabaseUrl(): string {
  const url = (globalThis as Record<symbol, unknown>)[VALIDATED_URL_KEY];
  if (typeof url !== 'string') {
    throw new Error('Aucune base de test validée : opération sur la base refusée en dehors des tests e2e.');
  }
  return assertSafeTestDatabaseUrl(url);
}
