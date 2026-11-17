import { BookingStatus, Prisma, PrismaClient, Residence, User, Vehicle } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AppModule } from '../app.module';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import * as request from 'supertest';
import { getValidatedTestDatabaseUrl, isAllowedTestDatabaseGrant, TEST_DATABASE_NAME } from './test-database';

/** Mot de passe de tous les comptes créés par seedTestData (haché à la création). */
export const TEST_PASSWORD = 'password123';

/**
 * Données d'un fichier e2e. Tous les comptes du fichier (créés ici ou via l'API avec `email()`)
 * partagent le domaine `e2e-<tag>.test`, propre au fichier : les fichiers exécutés en parallèle
 * n'entrent jamais en collision, et cleanupTestData ne supprime que ces données.
 */
export interface TestData {
  tag: string;
  email: (label: string) => string;
  adminUser: User;
  clientUser: User;
  otherClientUser: User;
  ownerUser: User;
  testResidence: Residence;
  testVehicle: Vehicle;
}

export class TestUtils {
  /**
   * Démarre l'application testée uniquement sur la base de test vérifiée.
   * La base effective de PrismaService est contrôlée après compile() et avant app.init() : aucun hook
   * (connexion, tâches planifiées montées en onApplicationBootstrap) n'a encore pu s'exécuter.
   */
  static async createTestApp(): Promise<INestApplication> {
    this.assertTestDatabaseConfigured();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    try {
      await this.assertConnectedToTestDatabase(moduleFixture.get(PrismaService));
    } catch (error) {
      await moduleFixture.close(); // onModuleDestroy : déconnexion de PrismaService
      throw error;
    }

    const app = moduleFixture.createNestApplication();
    try {
      // Même configuration HTTP que main.ts : filtre d'erreurs, préfixe /api et validation.
      app.useGlobalFilters(new GlobalExceptionFilter());
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );

      await app.init();
      this.stopScheduledTasks(app);
      return app;
    } catch (error) {
      await app.close();
      throw error;
    }
  }

  /**
   * Arrête les tâches planifiées (crons, intervalles, délais) de l'application testée : elles écriraient
   * en arrière-plan dans la base de test pendant les e2e. Leur comportement en production est inchangé.
   */
  private static stopScheduledTasks(app: INestApplication): void {
    const registry = app.get(SchedulerRegistry);
    registry.getCronJobs().forEach((job) => job.stop());
    registry.getIntervals().forEach((name) => registry.deleteInterval(name));
    registry.getTimeouts().forEach((name) => registry.deleteTimeout(name));
  }

  static async closeTestApp(app: INestApplication): Promise<void> {
    await app.close();
  }

  /**
   * Seul accès direct à la base depuis les tests : refuse toute connexion hors environnement
   * de test, hors base validée par setup-e2e.ts, ou si le serveur ne confirme pas la base attendue.
   */
  private static async connectToTestDatabase(): Promise<PrismaClient> {
    const url = this.assertTestDatabaseConfigured();

    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      await this.assertConnectedToTestDatabase(prisma);
      return prisma;
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  }

  /**
   * Contrôles préalables à toute connexion : exécution sous Jest avec NODE_ENV=test, URL validée
   * par setup-e2e.ts, et DATABASE_URL (lue par PrismaService) inchangée depuis. Renvoie l'URL validée.
   */
  private static assertTestDatabaseConfigured(): string {
    if (process.env.NODE_ENV !== 'test' || !process.env.JEST_WORKER_ID) {
      throw new Error('Accès à la base refusé : TestUtils ne fonctionne que sous Jest avec NODE_ENV=test.');
    }

    const url = getValidatedTestDatabaseUrl();
    if (process.env.DATABASE_URL !== url) {
      throw new Error("Accès à la base refusé : DATABASE_URL ne correspond plus à la base de test validée.");
    }
    return url;
  }

  /**
   * Vérifications côté serveur : la connexion porte bien sur la base de test, et les identifiants
   * utilisés n'ont aucun droit en dehors de cette base (des identifiants root ou de production sont refusés).
   */
  private static async assertConnectedToTestDatabase(client: Pick<PrismaClient, '$queryRaw'>): Promise<void> {
    const [row] = await client.$queryRaw<{ db: string | null }[]>`SELECT DATABASE() AS db`;
    if (row?.db !== TEST_DATABASE_NAME) {
      throw new Error(`Accès à la base refusé : le serveur indique la base "${row?.db}".`);
    }

    const grantRows = await client.$queryRaw<Record<string, unknown>[]>`SHOW GRANTS FOR CURRENT_USER()`;
    const grants = grantRows.map((grantRow) => String(Object.values(grantRow)[0]));
    const forbidden = grants.filter((grant) => !isAllowedTestDatabaseGrant(grant));
    if (grants.length === 0 || forbidden.length > 0) {
      throw new Error(
        `Accès à la base refusé : les identifiants de test ont des droits hors de "${TEST_DATABASE_NAME}" ` +
          `(${forbidden.join(' | ') || 'aucun droit lisible'}).`,
      );
    }
  }

  /**
   * Supprime uniquement les données du fichier e2e : comptes du domaine `e2e-<tag>.test`, biens
   * appartenant à ces comptes, et tout ce qui en dépend. Rien n'est ciblé par un identifiant fourni
   * par l'appelant (un identifiant absent deviendrait un filtre vide sur toute la table).
   */
  static async cleanupTestData(data: Pick<TestData, 'tag'>): Promise<void> {
    const tag = this.assertValidTag(data?.tag);
    const prisma = await this.connectToTestDatabase();

    try {
      await prisma.$transaction((tx) => this.deleteTaggedData(tx, tag), { timeout: 20000 });
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Une seule transaction (tout ou rien), dans l'ordre imposé par les clés étrangères RESTRICT.
   * Chaque suppression est filtrée par des listes d'identifiants ; une liste vide ne supprime rien.
   */
  private static async deleteTaggedData(tx: Prisma.TransactionClient, tag: string): Promise<void> {
    const ids = <T extends { id: string }>(rows: T[]) => rows.map(({ id }) => id);
    const userIds = ids(await tx.user.findMany({ where: { email: { endsWith: `@${this.testDomain(tag)}` } }, select: { id: true } }));
    const residenceIds = ids(await tx.residence.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } }));
    const vehicleIds = ids(await tx.vehicle.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } }));
    const bookingIds = ids(await tx.booking.findMany({
      where: { OR: [{ userId: { in: userIds } }, { residenceId: { in: residenceIds } }, { vehicleId: { in: vehicleIds } }] },
      select: { id: true },
    }));

    await tx.review.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { userId: { in: userIds } }] } });
    await tx.payment.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { userId: { in: userIds } }] } });
    await tx.favorite.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { residenceId: { in: residenceIds } }, { vehicleId: { in: vehicleIds } }] },
    });
    await tx.userDevice.deleteMany({ where: { userId: { in: userIds } } });
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } }); // blocked_dates : CASCADE
    await tx.offer.deleteMany({
      where: { OR: [{ ownerId: { in: userIds } }, { residenceId: { in: residenceIds } }, { vehicleId: { in: vehicleIds } }] },
    });
    await tx.residence.deleteMany({ where: { id: { in: residenceIds } } }); // blocked_dates, signalements : CASCADE
    await tx.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } }); // notifications, vérifications d'identité : CASCADE
  }

  private static assertValidTag(tag: unknown): string {
    if (typeof tag !== 'string' || !/^[0-9a-f]{12}$/.test(tag)) {
      throw new Error('Nettoyage refusé : identifiant de fichier de test invalide.');
    }
    return tag;
  }

  private static testDomain(tag: string): string {
    return `e2e-${tag}.test`;
  }

  /**
   * Crée les comptes et biens du fichier. En cas d'échec partiel, ce qui a déjà été créé pour ce
   * fichier est supprimé avant de relayer l'erreur : aucune donnée orpheline ne subsiste.
   */
  static async seedTestData(): Promise<TestData> {
    const prisma = await this.connectToTestDatabase();
    const tag = randomBytes(6).toString('hex');
    const email = (label: string) => `${label}@${this.testDomain(tag)}`;

    try {
      const password = await bcrypt.hash(TEST_PASSWORD, 10);
      const createUser = (label: string, role: 'ADMIN' | 'CLIENT' | 'PROPRIETAIRE') =>
        prisma.user.create({ data: { email: email(label), password, firstName: label, lastName: 'Test', role } });

      const adminUser = await createUser('admin', 'ADMIN');
      const clientUser = await createUser('client', 'CLIENT');
      const otherClientUser = await createUser('other-client', 'CLIENT');
      const ownerUser = await createUser('owner', 'PROPRIETAIRE');

      // Créer une résidence de test
      const testResidence = await prisma.residence.create({
        data: {
          ownerId: ownerUser.id,
          title: 'Test Residence',
          description: 'A test residence for unit tests',
          address: '123 Test Street',
          city: 'Test City',
          country: 'Test Country',
          pricePerDay: 100.0,
          capacity: 4,
          bedrooms: 2,
          bathrooms: 1,
          amenities: JSON.stringify(['WiFi', 'Parking']),
          images: JSON.stringify(['test-image.jpg']),
        },
      });

      // Créer un véhicule de test
      const testVehicle = await prisma.vehicle.create({
        data: {
          ownerId: ownerUser.id,
          brand: 'Test Brand',
          model: 'Test Model',
          year: 2023,
          type: 'CAR',
          pricePerDay: 50.0,
          capacity: 5,
          fuelType: 'Essence',
          transmission: 'Automatique',
          features: JSON.stringify(['GPS', 'Climatisation']),
          images: JSON.stringify(['test-car.jpg']),
        },
      });

      return {
        tag,
        email,
        adminUser,
        clientUser,
        otherClientUser,
        ownerUser,
        testResidence,
        testVehicle,
      };
    } catch (error) {
      try {
        await prisma.$transaction((tx) => this.deleteTaggedData(tx, tag), { timeout: 20000 });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Échec du seed, puis échec de son nettoyage.');
      }
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Préparations hors API pour les fichiers e2e (connexion vérifiée, comme seedTestData).
   * Chacune n'agit que sur les données du fichier : propriétaire et clients créés par seedTestData.
   */
  private static async withTestDatabase<T>(work: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    const prisma = await this.connectToTestDatabase();
    try {
      return await work(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }

  private static async assertOwnResidence(prisma: PrismaClient, data: TestData, residenceId: string): Promise<void> {
    const owned = await prisma.residence.count({ where: { id: residenceId, ownerId: data.ownerUser.id } });
    if (owned !== 1) throw new Error('Préparation refusée : résidence hors du fichier de test.');
  }

  /** Résidence supplémentaire du propriétaire du fichier ; ownerId est toujours celui du fichier. */
  static async createResidence(
    data: TestData,
    fields: Omit<Prisma.ResidenceUncheckedCreateInput, 'ownerId'>,
  ): Promise<Residence> {
    return this.withTestDatabase((prisma) =>
      prisma.residence.create({ data: { ...fields, ownerId: data.ownerUser.id } }),
    );
  }

  /** Séjour passé et terminé du client du fichier, avec son avis. */
  static async addCompletedStayReview(data: TestData, residenceId: string, rating: number, comment: string): Promise<void> {
    await this.withTestDatabase(async (prisma) => {
      await this.assertOwnResidence(prisma, data, residenceId);
      const booking = await prisma.booking.create({
        data: {
          residenceId,
          userId: data.clientUser.id,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-03'),
          totalPrice: 0,
          status: BookingStatus.COMPLETED,
        },
      });
      await prisma.review.create({ data: { residenceId, userId: data.clientUser.id, bookingId: booking.id, rating, comment } });
    });
  }

  /** Statut et date de création d'une réservation du fichier (transitions et écoulement du temps hors API). */
  static async setBookingState(
    data: TestData,
    bookingId: string,
    state: { status: BookingStatus; createdAt?: Date },
  ): Promise<void> {
    const userIds = [data.clientUser.id, data.otherClientUser.id];
    const { count } = await this.withTestDatabase((prisma) =>
      prisma.booking.updateMany({ where: { id: bookingId, userId: { in: userIds } }, data: state }),
    );
    if (count !== 1) throw new Error('Préparation refusée : réservation hors du fichier de test.');
  }

  /** Dates bloquées manuellement sur une résidence du fichier. */
  static async blockResidenceDates(data: TestData, residenceId: string, startDate: Date, endDate: Date): Promise<void> {
    await this.withTestDatabase(async (prisma) => {
      await this.assertOwnResidence(prisma, data, residenceId);
      await prisma.blockedDate.create({ data: { residenceId, startDate, endDate } });
    });
  }

  /** État du compte du propriétaire du fichier (désactivation, suppression logique, rétablissement). */
  static async setOwnerAccountState(data: TestData, state: { isActive: boolean; deletedAt: Date | null }): Promise<void> {
    await this.withTestDatabase((prisma) => prisma.user.update({ where: { id: data.ownerUser.id }, data: state }));
  }

  /** Date ISO à `days` jours d'aujourd'hui (négatif : passé). Les réservations exigent des dates futures. */
  static dateInDays(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  /** Jeton d'accès d'un compte. Échoue explicitement si la connexion est refusée. */
  static async getAuthToken(app: INestApplication, email: string, password: string = TEST_PASSWORD): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });

    if (response.status !== 200 || typeof response.body?.access_token !== 'string') {
      throw new Error(`Connexion de test refusée pour ${email} (HTTP ${response.status}).`);
    }
    return response.body.access_token;
  }
}
