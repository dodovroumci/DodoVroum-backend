/**
 * TestUtils.createTestApp() : l'application testée ne démarre que sur la base de test vérifiée.
 * Tests unitaires : PrismaService est simulé et AppModule remplacé par un module Nest minimal avec le vrai
 * ScheduleModule et des tâches planifiées à la seconde. Aucune connexion à une base n'est possible.
 */
jest.mock('../common/prisma/prisma.service', () => {
  class FakePrismaService {
    static ops: string[] = [];
    static serverDb: string | null = 'dodo_vroum_test';
    static grants: string[] = [];
    constructor() {
      FakePrismaService.ops.push('prisma:constructor');
    }
    async onModuleInit() {
      FakePrismaService.ops.push('prisma:onModuleInit');
    }
    async onModuleDestroy() {
      FakePrismaService.ops.push('prisma:onModuleDestroy');
    }
    $queryRaw = async (sql: TemplateStringsArray) => {
      if (sql.join('').includes('SHOW GRANTS')) {
        FakePrismaService.ops.push('prisma:SHOW GRANTS');
        return FakePrismaService.grants.map((grant) => ({ 'Grants for ci@%': grant }));
      }
      FakePrismaService.ops.push('prisma:SELECT DATABASE()');
      return [{ db: FakePrismaService.serverDb }];
    };
  }
  return { PrismaService: FakePrismaService };
});

jest.mock('../app.module', () => {
  const { Injectable, Module } = require('@nestjs/common');
  const { Cron, CronExpression, Interval, ScheduleModule } = require('@nestjs/schedule');
  const { PrismaService } = require('../common/prisma/prisma.service');

  class ScheduledJobs {
    onApplicationBootstrap() {
      PrismaService.ops.push('app:onApplicationBootstrap');
    }
    cron() {
      PrismaService.ops.push('task:cron');
    }
    interval() {
      PrismaService.ops.push('task:interval');
    }
  }
  Injectable()(ScheduledJobs);
  const method = (name: string) => Object.getOwnPropertyDescriptor(ScheduledJobs.prototype, name);
  Cron(CronExpression.EVERY_SECOND, { name: 'cron-every-second' })(ScheduledJobs.prototype, 'cron', method('cron'));
  Interval('interval-200ms', 200)(ScheduledJobs.prototype, 'interval', method('interval'));

  class AppModule {}
  Module({ imports: [ScheduleModule.forRoot()], providers: [PrismaService, ScheduledJobs] })(AppModule);
  return { AppModule };
});

import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { TestUtils } from './test-utils';
import { registerTestDatabaseUrl } from './test-database';

const Fake = PrismaService as any;
const VALID_URL = 'mysql://ci:ci@127.0.0.1:3306/dodo_vroum_test';
const CI_GRANTS = ['GRANT USAGE ON *.* TO `ci`@`%`', 'GRANT ALL PRIVILEGES ON `dodo\\_vroum\\_test`.* TO `ci`@`%`'];
// Plus d'un cycle des tâches planifiées (cron à la seconde, intervalle de 200 ms).
const waitForScheduledTasks = () => new Promise((resolve) => setTimeout(resolve, 1300));

beforeEach(() => {
  Fake.ops.length = 0;
  Fake.serverDb = 'dodo_vroum_test';
  Fake.grants = [...CI_GRANTS];
});

describe('TestUtils.createTestApp', () => {
  it('sans base de test validée : refus avant toute compilation, aucun PrismaService créé', async () => {
    await expect(TestUtils.createTestApp()).rejects.toThrow('Aucune base de test validée');
    expect(Fake.ops).toEqual([]);
  });

  describe('base de test validée', () => {
    const env = { ...process.env };
    beforeAll(() => {
      registerTestDatabaseUrl(VALID_URL);
      process.env.DATABASE_URL = VALID_URL;
    });
    afterAll(() => {
      process.env = env;
    });

    it('DATABASE_URL divergente : refus avant toute compilation', async () => {
      process.env.DATABASE_URL = 'mysql://dev:dev@127.0.0.1:3306/dodo_vroum';
      await expect(TestUtils.createTestApp()).rejects.toThrow('ne correspond plus');
      expect(Fake.ops).toEqual([]);
      process.env.DATABASE_URL = VALID_URL;
    });

    it('NODE_ENV différent de test : refus avant toute compilation', async () => {
      process.env.NODE_ENV = 'production';
      await expect(TestUtils.createTestApp()).rejects.toThrow('NODE_ENV=test');
      expect(Fake.ops).toEqual([]);
      process.env.NODE_ENV = 'test';
    });

    it.each([['dodo_vroum'], ['dodo_vroum_prod'], [null]])(
      'base effective %p : refus avant init(), PrismaService déconnecté, aucune tâche exécutée',
      async (db) => {
        Fake.serverDb = db;
        await expect(TestUtils.createTestApp()).rejects.toThrow('le serveur indique la base');
        await waitForScheduledTasks();
        expect(Fake.ops).toEqual(['prisma:constructor', 'prisma:SELECT DATABASE()', 'prisma:onModuleDestroy']);
      },
    );

    it.each([
      ['identifiants root', ['GRANT ALL PRIVILEGES ON *.* TO `root`@`%` WITH GRANT OPTION']],
      ['droits sur une autre base', [...CI_GRANTS, 'GRANT ALL PRIVILEGES ON `dodo_vroum`.* TO `ci`@`%`']],
    ])('%s : refus avant init(), PrismaService déconnecté, aucune tâche exécutée', async (_label, grants) => {
      Fake.grants = grants;
      await expect(TestUtils.createTestApp()).rejects.toThrow('droits hors de "dodo_vroum_test"');
      await waitForScheduledTasks();
      expect(Fake.ops).toEqual([
        'prisma:constructor',
        'prisma:SELECT DATABASE()',
        'prisma:SHOW GRANTS',
        'prisma:onModuleDestroy',
      ]);
    });

    it('base conforme : vérifications avant init(), puis tâches planifiées arrêtées', async () => {
      const app = await TestUtils.createTestApp();
      const startup = [...Fake.ops];
      await waitForScheduledTasks();
      const afterStartup = Fake.ops.slice(startup.length);
      const registry = app.get(SchedulerRegistry);
      const cronJobs = [...registry.getCronJobs().values()];
      const intervals = registry.getIntervals();
      const cronWasActive = cronJobs.map((job) => job.isActive);

      // Contrôle positif : un cron redémarré s'exécute bien, donc le silence observé ci-dessus n'est pas fortuit.
      cronJobs[0].start();
      await waitForScheduledTasks();
      const afterRestart = Fake.ops.slice(startup.length);
      await TestUtils.closeTestApp(app);

      expect(startup).toEqual([
        'prisma:constructor',
        'prisma:SELECT DATABASE()',
        'prisma:SHOW GRANTS',
        'prisma:onModuleInit',
        'app:onApplicationBootstrap',
      ]);
      expect(afterStartup).toEqual([]);
      expect(cronJobs).toHaveLength(1);
      expect(cronWasActive).toEqual([false]);
      expect(intervals).toEqual([]);
      expect(afterRestart).toContain('task:cron');
    });
  });
});
