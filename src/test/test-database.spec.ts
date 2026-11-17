/**
 * Garde de la base de test e2e : validation de TEST_DATABASE_URL, setup-e2e.ts et accès de TestUtils.
 * Tests unitaires : PrismaClient et AppModule sont simulés, aucune connexion à une base n'est possible.
 * L'ordre des blocs compte : l'URL validée n'est enregistrée qu'au dernier bloc, et pour ce fichier seulement.
 */
jest.mock('../app.module', () => ({ AppModule: class {} }));
jest.mock('@prisma/client', () => {
  class FakePrismaClient {
    static instances: FakePrismaClient[] = [];
    static ops: string[] = [];
    static serverDb: string | null = 'dodo_vroum_test';
    static grants: string[] = [];
    static failCreate = false;
    [model: string]: any;
    constructor(public readonly options: unknown) {
      FakePrismaClient.instances.push(this);
      for (const m of ['review', 'payment', 'booking', 'favorite', 'offer', 'residence', 'vehicle', 'user', 'userDevice']) {
        this[m] = {
          findMany: jest.fn(async () => {
            FakePrismaClient.ops.push(`find:${m}`);
            return [{ id: m }];
          }),
          deleteMany: jest.fn(async () => FakePrismaClient.ops.push(`delete:${m}`)),
          create: jest.fn(async () => {
            if (FakePrismaClient.failCreate) throw new Error('échec simulé');
            FakePrismaClient.ops.push(`create:${m}`);
            return { id: m };
          }),
        };
      }
      this.$queryRaw = jest.fn(async (sql: TemplateStringsArray) => {
        if (sql.join('').includes('SHOW GRANTS')) {
          FakePrismaClient.ops.push('grants');
          return FakePrismaClient.grants.map((grant) => ({ 'Grants for ci@%': grant }));
        }
        FakePrismaClient.ops.push('check');
        return [{ db: FakePrismaClient.serverDb }];
      });
      this.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        FakePrismaClient.ops.push('transaction');
        return fn(this);
      });
      this.$disconnect = jest.fn(async () => FakePrismaClient.ops.push('disconnect'));
    }
  }
  return { ...jest.requireActual('@prisma/client'), PrismaClient: FakePrismaClient };
});

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { TEST_PASSWORD, TestUtils } from './test-utils';
import { assertSafeTestDatabaseUrl, getValidatedTestDatabaseUrl, isAllowedTestDatabaseGrant } from './test-database';

const Fake = PrismaClient as any;
const PASSWORD = 'Fict1fPw';
const VALID_URL = `mysql://ci:${PASSWORD}@127.0.0.1:3306/dodo_vroum_test`;
// Nettoyage ciblé : recherche des données du fichier, puis suppressions dans l'ordre des clés étrangères.
const FINDS = ['user', 'residence', 'vehicle', 'booking'].map((m) => `find:${m}`);
const DELETES = ['review', 'payment', 'favorite', 'userDevice', 'booking', 'offer', 'residence', 'vehicle', 'user'].map((m) => `delete:${m}`);
const SAMPLE_DATA = { tag: 'abc123def456' };
// Un filtre vide (`{}`, ou une valeur undefined qu'ignore Prisma) sélectionnerait toute la table.
const hasEmptyFilter = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) && value.some(hasEmptyFilter)) ||
  (typeof value === 'object' && value !== null && !Array.isArray(value) &&
    (Object.keys(value).length === 0 || Object.values(value).some(hasEmptyFilter)));
// Droits créés par l'image Docker MySQL pour MYSQL_USER / MYSQL_DATABASE (service MySQL de la CI).
const CI_GRANTS = [
  'GRANT USAGE ON *.* TO `ci`@`%`',
  'GRANT ALL PRIVILEGES ON `dodo\\_vroum\\_test`.* TO `ci`@`%`',
];
const errorMessage = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
};

beforeEach(() => {
  Fake.instances.length = 0;
  Fake.ops.length = 0;
  Fake.serverDb = 'dodo_vroum_test';
  Fake.grants = [...CI_GRANTS];
  Fake.failCreate = false;
});

describe('isAllowedTestDatabaseGrant', () => {
  it.each([
    ['USAGE global', 'GRANT USAGE ON *.* TO `ci`@`%`'],
    ['base de test, nom échappé (image Docker)', 'GRANT ALL PRIVILEGES ON `dodo\\_vroum\\_test`.* TO `ci`@`%`'],
    ['base de test, droits partiels', 'GRANT SELECT, INSERT, DELETE ON `dodo\\_vroum\\_test`.* TO `ci`@`localhost`'],
    ['table de la base de test', 'GRANT SELECT ON `dodo_vroum_test`.`User` TO `ci`@`localhost`'],
    ['colonnes d\'une table de la base de test', 'GRANT SELECT (`id`, `email`) ON `dodo_vroum_test`.`User` TO `ci`@`%`'],
  ])('accepte : %s', (_label, grant) => {
    expect(isAllowedTestDatabaseGrant(grant)).toBe(true);
  });

  it.each([
    ['root : tous les droits globaux', 'GRANT ALL PRIVILEGES ON *.* TO `root`@`%` WITH GRANT OPTION'],
    ['droit global autre que USAGE', 'GRANT SELECT ON *.* TO `ci`@`%`'],
    ['droits dynamiques globaux', 'GRANT BACKUP_ADMIN,SYSTEM_VARIABLES_ADMIN ON *.* TO `root`@`localhost`'],
    ['autre base', 'GRANT ALL PRIVILEGES ON `dodo_vroum`.* TO `ci`@`%`'],
    ['base préfixe', 'GRANT ALL PRIVILEGES ON `dodo_vroum_test_old`.* TO `ci`@`%`'],
    ['motif joker', 'GRANT ALL PRIVILEGES ON `dodo%`.* TO `ci`@`%`'],
    // Au niveau base, `_` non échappé est un joker MySQL : ces droits couvrent d'autres bases.
    ['nom non échappé (joker _)', 'GRANT ALL PRIVILEGES ON `dodo_vroum_test`.* TO `ci`@`%`'],
    ['autre base couverte par le joker _', 'GRANT ALL PRIVILEGES ON `dodoXvroumYtest`.* TO `ci`@`%`'],
    ['autre base couverte par le joker _ (tirets)', 'GRANT ALL PRIVILEGES ON `dodo-vroum-test`.* TO `ci`@`%`'],
    ['échappement partiel', 'GRANT ALL PRIVILEGES ON `dodo\\_vroum_test`.* TO `ci`@`%`'],
    ['joker % dans le nom', 'GRANT ALL PRIVILEGES ON `dodo%vroum%test`.* TO `ci`@`%`'],
    ['joker % en suffixe', 'GRANT ALL PRIVILEGES ON `dodo\\_vroum\\_test%`.* TO `ci`@`%`'],
    ['autre base échappée, préfixe', 'GRANT ALL PRIVILEGES ON `dodo\\_vroum\\_test\\_old`.* TO `ci`@`%`'],
    ['casse différente', 'GRANT ALL PRIVILEGES ON `DODO\\_VROUM\\_TEST`.* TO `ci`@`%`'],
    ['base sans guillemets', 'GRANT ALL PRIVILEGES ON dodo_vroum_test.* TO `ci`@`%`'],
    ['table d\'une autre base', 'GRANT SELECT ON `dodo_vroum`.`User` TO `ci`@`%`'],
    ['table, nom de base échappé (base littérale différente)', 'GRANT SELECT ON `dodo\\_vroum\\_test`.`User` TO `ci`@`%`'],
    ['table, base au nom proche', 'GRANT SELECT ON `dodoXvroumYtest`.`User` TO `ci`@`%`'],
    ['routine', 'GRANT EXECUTE ON PROCEDURE `dodo_vroum_test`.`p` TO `ci`@`%`'],
    ['rôle', 'GRANT `app_role`@`%` TO `ci`@`%`'],
    ['PROXY', "GRANT PROXY ON ''@'' TO 'ci'@'%' WITH GRANT OPTION"],
    ['ligne illisible', 'n importe quoi'],
  ])('refuse : %s', (_label, grant) => {
    expect(isAllowedTestDatabaseGrant(grant)).toBe(false);
  });
});

describe('assertSafeTestDatabaseUrl', () => {
  it.each([
    [VALID_URL],
    [`mysql://ci:${PASSWORD}@localhost/dodo_vroum_test`],
    [`mysql://ci:${PASSWORD}@localhost:3307/dodo_vroum_test?connection_limit=1&connect_timeout=5`],
    ['mysql://ci:p%40ss@127.0.0.1/dodo_vroum_test'],
  ])('accepte %s', (url) => {
    expect(assertSafeTestDatabaseUrl(url)).toBe(url);
  });

  it.each([
    ['absente', undefined, 'obligatoire'],
    ['vide', '', 'obligatoire'],
    ['illisible', 'pas une url', 'illisible'],
    ['PostgreSQL', `postgresql://u:${PASSWORD}@127.0.0.1:5432/dodo_vroum_test`, 'protocole'],
    ['postgres://', `postgres://u:${PASSWORD}@localhost/dodo_vroum_test`, 'protocole'],
    ['autre base', `mysql://u:${PASSWORD}@127.0.0.1/dodo_vroum`, 'base "dodo_vroum"'],
    ['base préfixe', `mysql://u:${PASSWORD}@127.0.0.1/dodo_vroum_test_old`, 'base'],
    ['base vide', `mysql://u:${PASSWORD}@127.0.0.1/`, 'base'],
    ['slash final', `mysql://u:${PASSWORD}@127.0.0.1/dodo_vroum_test/`, 'base'],
    ['base encodée', `mysql://u:${PASSWORD}@127.0.0.1/dodo_vroum_test%2F..`, 'base'],
    ['hôte distant', `mysql://u:${PASSWORD}@203.0.113.10:3306/dodo_vroum_test`, 'hôte'],
    ['hôte sosie', `mysql://u:${PASSWORD}@127.0.0.1.evil.example/dodo_vroum_test`, 'hôte'],
    ['hôte nommé', `mysql://u:${PASSWORD}@db.example.com/dodo_vroum_test`, 'hôte'],
    ['IPv6', `mysql://u:${PASSWORD}@[::1]/dodo_vroum_test`, 'hôte'],
    ['majuscules', `mysql://u:${PASSWORD}@LOCALHOST/dodo_vroum_test`, 'hôte'],
    ['socket', `mysql://u:${PASSWORD}@localhost/dodo_vroum_test?socket=/tmp/mysql.sock`, 'socket'],
    ['socket après un paramètre admis', `mysql://u:${PASSWORD}@localhost/dodo_vroum_test?connection_limit=1&socket=/x`, 'socket'],
    ['paramètre inconnu', `mysql://u:${PASSWORD}@localhost/dodo_vroum_test?sslaccept=accept_invalid_certs`, 'sslaccept'],
  ])('refuse : %s (sans afficher le mot de passe)', (_label, url, expected) => {
    const message = errorMessage(() => assertSafeTestDatabaseUrl(url));
    expect(message).toContain(expected);
    expect(message).not.toContain(PASSWORD);
  });
});

describe('configuration unitaire : aucune base enregistrée', () => {
  it("DATABASE_URL est l'URL injoignable .invalid", () => {
    expect(new URL(process.env.DATABASE_URL as string).hostname).toBe('unit-tests.invalid');
  });

  it('NODE_ENV=test ne suffit pas : ni suppression ni écriture, aucun client créé', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    await expect(TestUtils.cleanupTestData(SAMPLE_DATA)).rejects.toThrow('en dehors des tests e2e');
    await expect(TestUtils.seedTestData()).rejects.toThrow('en dehors des tests e2e');
    expect(Fake.instances).toHaveLength(0);
  });
});

describe('setup-e2e.ts', () => {
  const env = { ...process.env };
  const loadSetupE2e = () => jest.isolateModules(() => require('./setup-e2e'));
  afterAll(() => {
    process.env = env;
  });

  it.each([
    ['absente', undefined],
    ['PostgreSQL', 'postgresql://u:p@127.0.0.1:5432/dodo_vroum_test'],
    ['autre base', 'mysql://u:p@127.0.0.1:3306/dodo_vroum'],
    ['hôte non autorisé', 'mysql://u:p@203.0.113.10:3306/dodo_vroum_test'],
    ['socket', 'mysql://u:p@localhost/dodo_vroum_test?socket=/tmp/mysql.sock'],
  ])('TEST_DATABASE_URL %s : arrêt, rien enregistré, DATABASE_URL inchangée', (_label, url) => {
    process.env = { ...env, DATABASE_URL: 'mysql://dev:dev@127.0.0.1:3306/dodo_vroum' };
    if (url === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = url;

    expect(loadSetupE2e).toThrow('TEST_DATABASE_URL');
    expect(() => getValidatedTestDatabaseUrl()).toThrow('Aucune base de test validée');
    expect(process.env.DATABASE_URL).toBe('mysql://dev:dev@127.0.0.1:3306/dodo_vroum');
  });

  // Dernier bloc du fichier : à partir d'ici, l'URL validée est enregistrée pour ce fichier.
  describe('URL conforme', () => {
    beforeAll(() => {
      process.env = { ...env, TEST_DATABASE_URL: VALID_URL, DATABASE_URL: 'mysql://dev:dev@127.0.0.1/dodo_vroum' };
      loadSetupE2e();
    });

    it("enregistre l'URL et l'impose comme DATABASE_URL de l'application", () => {
      expect(getValidatedTestDatabaseUrl()).toBe(VALID_URL);
      expect(process.env.DATABASE_URL).toBe(VALID_URL);
    });

    it("l'URL enregistrée ne peut pas être remplacée, même par une autre URL conforme", () => {
      process.env.TEST_DATABASE_URL = 'mysql://autre:autre@localhost:3307/dodo_vroum_test';
      expect(loadSetupE2e).toThrow('Cannot redefine property');
      expect(() => {
        (globalThis as any)[Symbol.for('dodovroum.test.validatedTestDatabaseUrl')] = 'mysql://x:y@127.0.0.1/dodo_vroum_test';
      }).toThrow(TypeError);
      expect(getValidatedTestDatabaseUrl()).toBe(VALID_URL);
      process.env.TEST_DATABASE_URL = VALID_URL;
      process.env.DATABASE_URL = VALID_URL;
    });

    it('cleanupTestData : un seul client, sur l’URL validée, SELECT DATABASE() avant la 1re suppression, transaction, finally', async () => {
      await TestUtils.cleanupTestData(SAMPLE_DATA);
      expect(Fake.instances).toHaveLength(1);
      expect(Fake.instances[0].options).toEqual({ datasources: { db: { url: VALID_URL } } });
      expect(Fake.ops).toEqual(['check', 'grants', 'transaction', ...FINDS, ...DELETES, 'disconnect']);
    });

    it('cleanupTestData : uniquement les comptes du domaine du fichier, aucune suppression sans filtre', async () => {
      await TestUtils.cleanupTestData(SAMPLE_DATA);
      const client = Fake.instances[0];
      expect(client.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: { endsWith: '@e2e-abc123def456.test' } } }),
      );
      for (const m of ['review', 'payment', 'favorite', 'userDevice', 'booking', 'offer', 'residence', 'vehicle', 'user']) {
        expect(client[m].deleteMany).toHaveBeenCalledTimes(1);
        const [args] = client[m].deleteMany.mock.calls[0];
        expect(args?.where).toBeDefined();
        expect(hasEmptyFilter(args.where)).toBe(false);
      }
      for (const m of ['user', 'residence', 'vehicle', 'booking']) {
        expect(hasEmptyFilter(client[m].findMany.mock.calls[0][0].where)).toBe(false);
      }
    });

    it.each([[undefined], [''], ['abc'], ['ABC123DEF456'], ['abc123def456%'], [{}]])(
      'cleanupTestData : identifiant de fichier %p invalide, refus avant toute connexion',
      async (tag) => {
        await expect(TestUtils.cleanupTestData({ tag } as any)).rejects.toThrow('identifiant de fichier de test invalide');
        expect(Fake.instances).toHaveLength(0);
      },
    );

    it('seedTestData : SELECT DATABASE() avant la 1re écriture, même client, finally', async () => {
      await TestUtils.seedTestData();
      expect(Fake.instances).toHaveLength(1);
      expect(Fake.ops).toEqual([
        'check', 'grants', 'create:user', 'create:user', 'create:user', 'create:user', 'create:residence', 'create:vehicle', 'disconnect',
      ]);
    });

    it('seedTestData : mot de passe haché valide pour TEST_PASSWORD, domaine propre à chaque appel', async () => {
      const first = await TestUtils.seedTestData();
      const second = await TestUtils.seedTestData();
      const userCreates = Fake.instances[0].user.create.mock.calls.map(([args]) => args.data);
      expect(userCreates).toHaveLength(4);
      for (const data of userCreates) {
        expect(data.password).not.toBe(TEST_PASSWORD);
        expect(await bcrypt.compare(TEST_PASSWORD, data.password)).toBe(true);
        expect(data.email.endsWith(`@e2e-${first.tag}.test`)).toBe(true);
      }
      expect(first.tag).not.toBe(second.tag);
      expect(first.email('x')).toBe(`x@e2e-${first.tag}.test`);
    });

    it('seedTestData : échec partiel, données du fichier supprimées puis client déconnecté', async () => {
      Fake.failCreate = true;
      await expect(TestUtils.seedTestData()).rejects.toThrow('échec simulé');
      expect(Fake.ops).toEqual(['check', 'grants', 'transaction', ...FINDS, ...DELETES, 'disconnect']);
      const [args] = Fake.instances[0].user.findMany.mock.calls[0];
      expect(args.where.email.endsWith).toMatch(/^@e2e-[0-9a-f]{12}\.test$/);
    });

    it.each([
      ['identifiants root', ['GRANT ALL PRIVILEGES ON *.* TO `root`@`%` WITH GRANT OPTION']],
      ['droits sur une autre base', [...CI_GRANTS, 'GRANT ALL PRIVILEGES ON `dodo_vroum`.* TO `ci`@`%`']],
      ['aucun droit lisible', []],
    ])('%s : ni suppression ni écriture', async (_label, grants) => {
      Fake.grants = grants;
      await expect(TestUtils.cleanupTestData(SAMPLE_DATA)).rejects.toThrow('droits hors de "dodo_vroum_test"');
      await expect(TestUtils.seedTestData()).rejects.toThrow('droits hors de "dodo_vroum_test"');
      expect(Fake.ops).toEqual(['check', 'grants', 'disconnect', 'check', 'grants', 'disconnect']);
    });

    it.each([['dodo_vroum'], ['dodo_vroum_prod'], [null]])('base effective %p : ni suppression ni écriture', async (db) => {
      Fake.serverDb = db;
      await expect(TestUtils.cleanupTestData(SAMPLE_DATA)).rejects.toThrow('Accès à la base refusé');
      await expect(TestUtils.seedTestData()).rejects.toThrow('Accès à la base refusé');
      expect(Fake.ops).toEqual(['check', 'disconnect', 'check', 'disconnect']);
    });

    it('DATABASE_URL modifiée après le setup : refus avant toute connexion', async () => {
      process.env.DATABASE_URL = 'mysql://dev:dev@127.0.0.1/dodo_vroum';
      await expect(TestUtils.cleanupTestData(SAMPLE_DATA)).rejects.toThrow('ne correspond plus');
      expect(Fake.instances).toHaveLength(0);
      process.env.DATABASE_URL = VALID_URL;
    });

    it('NODE_ENV différent de test : refus avant toute connexion', async () => {
      process.env.NODE_ENV = 'production';
      await expect(TestUtils.cleanupTestData(SAMPLE_DATA)).rejects.toThrow('NODE_ENV=test');
      expect(Fake.instances).toHaveLength(0);
      process.env.NODE_ENV = 'test';
    });
  });
});
