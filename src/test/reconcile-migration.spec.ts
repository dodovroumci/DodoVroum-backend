/**
 * Invariants de la migration conditionnelle de réconciliation (Lot 0B).
 * Lecture statique du fichier uniquement : aucune base, aucune commande exécutée.
 * Si l'un de ces tests échoue, corriger la migration — jamais assouplir le test.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'prisma', 'migrations');
const MIGRATION_NAME = '20261110120000_reconcile_schema_drift';
const sql = readFileSync(resolve(MIGRATIONS_DIR, MIGRATION_NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');

/**
 * Découpe le SQL en ordres (séparés par `;` hors chaînes), commentaires `--` retirés, et en chaînes
 * ('…' avec '' échappé). Les ordres conservent leurs chaînes telles qu'écrites.
 */
function scan(source: string): { statements: string[]; strings: string[] } {
  const statements: string[] = [];
  const strings: string[] = [];
  let current = '';
  for (let i = 0; i < source.length; i++) {
    if (source.startsWith('--', i)) {
      while (i < source.length && source[i] !== '\n') i++;
      current += '\n';
    } else if (source[i] === "'") {
      let value = '';
      current += "'";
      for (i++; i < source.length; i++) {
        current += source[i];
        if (source[i] === "'" && source[i + 1] === "'") {
          value += "'";
          current += source[++i];
        } else if (source[i] === "'") {
          break;
        } else {
          value += source[i];
        }
      }
      strings.push(value);
    } else if (source[i] === ';') {
      statements.push(current.trim());
      current = '';
    } else {
      current += source[i];
    }
  }
  if (current.trim()) statements.push(current.trim());
  return { statements: statements.filter(Boolean), strings };
}

const { statements, strings } = scan(sql);
const everything = [...statements, ...strings].join('\n');
const isDdl = (value: string) => /^(ALTER TABLE|CREATE (UNIQUE )?INDEX)\b/.test(value);

describe(`migration ${MIGRATION_NAME}`, () => {
  it('ne supprime, ne vide et ne modifie aucune donnée', () => {
    const withoutReferentialRules = everything.replace(/\bON (DELETE|UPDATE) (RESTRICT|CASCADE)\b|\b(DELETE|UPDATE)_RULE\b/gi, '');
    expect(withoutReferentialRules).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|REPLACE|RENAME TABLE|CHANGE|GRANT|REVOKE)\b/i);
    expect(everything).not.toMatch(/\bDROP\b/i);
  });

  it("n'exécute aucun ordre DDL directement, sauf CREATE TABLE IF NOT EXISTS", () => {
    const direct = statements.filter((statement) => /^(ALTER|CREATE|RENAME)\b/i.test(statement));
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatch(/^CREATE TABLE IF NOT EXISTS `user_devices`/);
  });

  it('conditionne chaque ordre DDL préparé par un contrôle information_schema, avec DO 0 sinon', () => {
    const ddl = strings.filter(isDdl);
    expect(ddl).toHaveLength(25);
    ddl.forEach((value) => {
      const quoted = `'${value.replace(/'/g, "''")}'`;
      const owners = statements.filter((statement) => statement.includes(quoted));
      expect(owners).toHaveLength(1);
      const [owner] = owners;
      expect(owner).toMatch(/^SET @s := IF\(\(SELECT COUNT\(\*\) FROM information_schema\./);
      expect(owner).toMatch(/,\s*'DO 0'\)$/);
      const next = statements.slice(statements.indexOf(owner) + 1, statements.indexOf(owner) + 4);
      expect(next).toEqual(['PREPARE stmt FROM @s', 'EXECUTE stmt', 'DEALLOCATE PREPARE stmt']);
    });
  });

  it('ne réduit aucun type : seuls des élargissements sont autorisés sur les colonnes existantes', () => {
    const modifies = strings.filter((value) => /\bMODIFY\b/.test(value));
    expect(modifies).toEqual([
      expect.stringMatching(/^ALTER TABLE `bookings` MODIFY `status` ENUM\(.*'EXPIRED'.*\) NOT NULL DEFAULT 'AWAITING_PAYMENT'$/),
      'ALTER TABLE `residences` MODIFY `description` TEXT NOT NULL',
    ]);
  });

  it("vérifie les définitions existantes avant toute modification, puis le résultat après la dernière", () => {
    const pre = sql.indexOf("SET @reconcile_phase := 'pre'");
    const post = sql.indexOf("SET @reconcile_phase := 'post'");
    const firstDdl = sql.search(/'(ALTER TABLE|CREATE (UNIQUE )?INDEX)|^CREATE TABLE/m);
    const lastDdl = Math.max(sql.lastIndexOf("'ALTER TABLE"), sql.lastIndexOf("'CREATE "), sql.lastIndexOf('CREATE TABLE IF NOT EXISTS'));
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(firstDdl);
    expect(post).toBeGreaterThan(lastDdl);
    expect(sql.match(/EXECUTE reconcile_check;/g)).toHaveLength(2);
    // Contrôles de données (doublons, orphelins) avant le premier ordre DDL.
    ['duplicates__users_resetPasswordToken', 'duplicates__payments_webhookEventId', 'duplicates__user_devices_userId_token', 'orphans__user_devices_userId']
      .forEach((check) => expect(sql.indexOf(`reconcile_pre__${check}`)).toBeLessThan(firstDdl));
  });

  it('compare type, nullabilité, défaut, collation et EXTRA des colonnes, et colonnes/unicité/préfixe des index', () => {
    const check = strings.find((value) => value.includes('INTO @reconcile_problem')) ?? '';
    ['COLUMN_TYPE', 'IS_NULLABLE', 'COLUMN_DEFAULT', 'COLLATION_NAME', 'EXTRA', 'NON_UNIQUE', 'SUB_PART', 'INDEX_TYPE', 'TABLE_COLLATION', 'UPDATE_RULE', 'DELETE_RULE']
      .forEach((field) => expect(check).toContain(field));
  });

  it('déclare des définitions attendues en JSON valide, avec collation utf8mb4_unicode_ci pour user_devices', () => {
    const columns: string[][] = JSON.parse(strings[strings.findIndex((value) => value.trim().startsWith('[\n  ["users", "deletedAt"'))]);
    const indexes: unknown[][] = JSON.parse(strings[strings.findIndex((value) => value.trim().startsWith('[\n  ["users", "users_resetPasswordToken_key"'))]);
    expect(columns).toHaveLength(23);
    expect(indexes).toHaveLength(10);
    columns
      .filter(([table, , type]) => table === 'user_devices' && type.startsWith('varchar'))
      .forEach((column) => expect(column[5]).toBe('utf8mb4_unicode_ci'));
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `user_devices` \([\s\S]*?\) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  });

  it('ne contient aucun point-virgule dans une chaîne SQL', () => {
    strings.forEach((value) => expect(value).not.toContain(';'));
  });
});

describe('script de contrôle prisma/reconcile-schema-drift.verify.sql', () => {
  const verify = scan(readFileSync(resolve(MIGRATIONS_DIR, '..', 'reconcile-schema-drift.verify.sql'), 'utf8').replace(/\r\n/g, '\n'));

  it('reste en lecture seule : uniquement SET de variables de session, PREPARE, EXECUTE et SELECT', () => {
    verify.statements.forEach((statement) => expect(statement).toMatch(/^(SET @\w+ :=|PREPARE reconcile_check FROM|EXECUTE reconcile_check$|DEALLOCATE PREPARE reconcile_check$)/));
    const check = verify.strings.find((value) => value.includes('FROM information_schema')) ?? '';
    expect(check.trim()).toMatch(/^SELECT @reconcile_phase AS phase, problem FROM \(/);
    expect(check.replace(/\b(DELETE|UPDATE)_RULE\b/g, '')).not.toMatch(/\b(ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE|RENAME)\b/i);
  });

  it('utilise exactement les mêmes définitions attendues que la migration', () => {
    const definitions = (statementList: string[]) =>
      statementList.filter((statement) => /^SET @reconcile_(columns|indexes) :=/.test(statement));
    expect(definitions(verify.statements)).toEqual(definitions(statements));
    expect(definitions(statements)).toHaveLength(2);
    const normalize = (value: string) => value.replace(/SELECT (MIN\(problem\) INTO @reconcile_problem|@reconcile_phase AS phase, problem) FROM/, 'SELECT FROM').replace(/ ORDER BY problem$/, '');
    const migrationCheck = strings.find((value) => value.includes('INTO @reconcile_problem')) ?? '';
    const verifyCheck = verify.strings.find((value) => value.includes('FROM information_schema')) ?? '';
    expect(normalize(verifyCheck.trim())).toBe(normalize(migrationCheck.trim()));
  });
});
