/**
 * Invariants de configuration qui empêchent les tests d'atteindre une autre base que `dodo_vroum_test`.
 * Lecture statique des fichiers uniquement : aucune base, aucun réseau, aucune commande exécutée.
 * Si l'un de ces tests échoue, corriger la configuration — jamais assouplir le test.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { assertSafeTestDatabaseUrl, TEST_DATABASE_NAME } from './test-database';

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(resolve(PROJECT_ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const readJson = (path: string) => JSON.parse(read(path));

const packageJson = readJson('package.json');
const unitConfig = packageJson.jest;
const e2eConfig = readJson('test/jest-e2e.json');
const unitRootDir = resolve(PROJECT_ROOT, unitConfig.rootDir);
const e2eRootDir = resolve(PROJECT_ROOT, 'test', e2eConfig.rootDir);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : listFiles(path);
    return [path];
  });
}

const projectFiles = [...listFiles(join(PROJECT_ROOT, 'src')), ...listFiles(join(PROJECT_ROOT, 'test'))];
const e2eSpecFiles = projectFiles.filter((file) => file.endsWith('.e2e-spec.ts'));
const unitSpecFiles = projectFiles.filter((file) => file.endsWith('.spec.ts') && !file.endsWith('.e2e-spec.ts'));
const isInside = (file: string, dir: string) => file.startsWith(dir + sep);

describe('configuration Jest unitaire (package.json)', () => {
  it('utilise uniquement src/test/setup.ts, qui ne lit jamais TEST_DATABASE_URL', () => {
    expect(unitRootDir).toBe(join(PROJECT_ROOT, 'src'));
    expect(unitConfig.setupFilesAfterEnv).toEqual(['<rootDir>/test/setup.ts']);
    expect(unitConfig.setupFiles).toBeUndefined();
    expect(unitConfig.globalSetup).toBeUndefined();
    expect(unitConfig.roots).toBeUndefined();
    expect(read('src/test/setup.ts')).not.toContain('TEST_DATABASE_URL');
    expect(read('src/test/setup-common.ts')).not.toContain('TEST_DATABASE_URL');
  });

  it("fournit une DATABASE_URL injoignable (TLD réservé .invalid) et n'enregistre aucune base de test", () => {
    const setup = read('src/test/setup.ts');
    const match = /process\.env\.DATABASE_URL = '([^']+)'/.exec(setup);
    expect(match).not.toBeNull();
    expect(new URL(match![1]).hostname.endsWith('.invalid')).toBe(true);
    expect(setup).not.toMatch(/registerTestDatabaseUrl|setup-e2e/);
  });

  it("ne sélectionne aucun fichier e2e, quel que soit le script npm qui l'utilise", () => {
    const regex = new RegExp(unitConfig.testRegex);
    expect(e2eSpecFiles.length).toBeGreaterThan(0);
    e2eSpecFiles.forEach((file) => expect(regex.test(file)).toBe(false));
    unitSpecFiles.forEach((file) => expect(regex.test(file)).toBe(true));
  });
});

describe('configuration Jest e2e (test/jest-e2e.json)', () => {
  it('utilise uniquement src/test/setup-e2e.ts et ne sélectionne que les fichiers e2e', () => {
    expect(e2eRootDir).toBe(join(PROJECT_ROOT, 'src'));
    expect(e2eConfig.setupFilesAfterEnv).toEqual(['<rootDir>/test/setup-e2e.ts']);
    expect(e2eConfig.setupFiles).toBeUndefined();
    expect(e2eConfig.globalSetup).toBeUndefined();
    expect(e2eConfig.roots).toBeUndefined();
    const regex = new RegExp(e2eConfig.testRegex);
    unitSpecFiles.forEach((file) => expect(regex.test(file)).toBe(false));
  });

  it('setup-e2e.ts valide TEST_DATABASE_URL avant de la transmettre à DATABASE_URL, sans repli', () => {
    const setup = read('src/test/setup-e2e.ts');
    expect(setup).toContain('registerTestDatabaseUrl(process.env.TEST_DATABASE_URL)');
    expect(setup).not.toMatch(/process\.env\.DATABASE_URL\s*(\|\||\?\?)/);
    expect(setup).not.toMatch(/dotenv|\.env['"]/);
  });

  it('setup-e2e.ts désactive les services externes que .env pourrait activer (SMTP, push, paiement)', () => {
    const setup = read('src/test/setup-e2e.ts');
    ['SMTP_HOST', 'FIREBASE_CREDENTIALS_PATH', 'GENIUSPAY_API_KEY', 'GENIUSPAY_API_SECRET'].forEach((name) =>
      expect(setup).toContain(`'${name}'`),
    );
    expect(setup).toMatch(/process\.env\[name\] = '';/);
  });
});

describe('fichiers de test e2e', () => {
  it('sont tous dans la racine e2e, donc soumis à setup-e2e.ts (aucun fichier hors de portée des protections)', () => {
    e2eSpecFiles.forEach((file) => expect(relative(PROJECT_ROOT, file)).toMatch(/^src\//));
    expect(e2eSpecFiles.every((file) => isInside(file, e2eRootDir))).toBe(true);
  });

  it.each(e2eSpecFiles.filter((file) => isInside(file, e2eRootDir)).map((file) => [relative(PROJECT_ROOT, file)]))(
    "%s n'accède à la base que par TestUtils",
    (file) => {
      const source = read(file);
      expect(source).not.toMatch(/new PrismaClient|PrismaService|createTestingModule\(|\$executeRaw|\$queryRaw|@prisma\/client/);
      expect(source).not.toMatch(/DATABASE_URL/);
    },
  );
});

describe('substitut Jest de uuid', () => {
  it.each([
    ['unitaire', unitConfig],
    ['e2e', e2eConfig],
  ])('configuration %s : mapping "^uuid$" vers le substitut, sous la clé Jest moduleNameMapper', (_label, config) => {
    expect(config.moduleNameMapper?.['^uuid$']).toBe('<rootDir>/test/uuid-jest-shim.ts');
    expect(config.moduleNameMapping).toBeUndefined();
  });

  it("le code de production n'importe jamais le substitut", () => {
    projectFiles
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !isInside(file, join(PROJECT_ROOT, 'src', 'test')))
      .forEach((file) => expect(`${relative(PROJECT_ROOT, file)}: ${read(file)}`).not.toContain('uuid-jest-shim'));
  });
});

describe('scripts npm de test', () => {
  it("n'utilisent ni autre configuration, ni racine, ni setup de remplacement", () => {
    Object.entries<string>(packageJson.scripts)
      .filter(([, command]) => /\bjest\b/.test(command))
      .forEach(([name, command]) => {
        expect(`${name}: ${command}`).not.toMatch(/--(roots|rootDir|setupFiles|setupFilesAfterEnv|globalSetup)\b/);
        const config = /--config[ =](\S+)/.exec(command);
        if (config) expect(`${name}: ${config[1]}`).toBe(`${name}: ./test/jest-e2e.json`);
      });
  });
});

describe('workflow CI (.github/workflows/ci-cd.yml)', () => {
  const workflow = read('.github/workflows/ci-cd.yml');
  const testJob = /\n {2}test:\n([\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/.exec(workflow)?.[1] ?? '';
  const value = (key: string) => new RegExp(`^\\s+${key}: (\\S+)$`, 'm').exec(testJob)?.[1];

  it('le job test utilise un service MySQL éphémère, sans PostgreSQL', () => {
    expect(testJob).toMatch(/image: mysql:8\.\d+/);
    expect(workflow).not.toMatch(/postgres|5432|pg_isready/i);
  });

  it("n'exécute aucune commande Prisma destructive ou de réinitialisation", () => {
    expect(workflow).not.toMatch(/migrate (dev|reset|resolve)|db push|prisma:migrate|force-reset|accept-data-loss/);
    // migrate deploy uniquement dans le job test, donc uniquement sur la base MySQL éphémère de la CI.
    expect(workflow.replace(testJob, '')).not.toContain('migrate deploy');
    expect(testJob).toContain('run: npx prisma migrate deploy');
  });

  it('la base et les identifiants du service sont ceux de la base de test, jamais root', () => {
    expect(value('MYSQL_DATABASE')).toBe(TEST_DATABASE_NAME);
    expect(value('MYSQL_USER')).toBeDefined();
    expect(value('MYSQL_USER')).not.toBe('root');
  });

  it('TEST_DATABASE_URL est conforme, identique à DATABASE_URL, et utilise MYSQL_USER', () => {
    const testUrl = value('TEST_DATABASE_URL');
    expect(testUrl).toBeDefined();
    expect(() => assertSafeTestDatabaseUrl(testUrl)).not.toThrow();
    expect(value('DATABASE_URL')).toBe(testUrl);
    expect(decodeURIComponent(new URL(testUrl!).username)).toBe(value('MYSQL_USER'));
    expect(testUrl).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("n'utilise aucun secret GitHub dans le job test", () => {
    expect(testJob).not.toMatch(/secrets\./);
  });
});

it('le fichier .env.test est ignoré par git', () => {
  expect(read('.gitignore').split('\n').map((line) => line.trim())).toContain('.env.test');
});
