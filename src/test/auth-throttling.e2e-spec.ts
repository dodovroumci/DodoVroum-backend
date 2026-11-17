import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TEST_PASSWORD, TestData, TestUtils } from '../test/test-utils';

/**
 * Limitation des connexions de bout en bout (base de test réelle).
 * Application et données propres à ce fichier : ses compteurs (en mémoire) et ses comptes
 * n'interfèrent pas avec les autres fichiers e2e. Toutes les requêtes viennent de la même IP.
 */
describe('Limitation des connexions (e2e)', () => {
  let app: INestApplication;
  let testData: TestData;

  beforeAll(async () => {
    app = await TestUtils.createTestApp();
    testData = await TestUtils.seedTestData();
  });

  afterAll(async () => {
    if (testData) await TestUtils.cleanupTestData(testData);
    if (app) await TestUtils.closeTestApp(app);
  });

  const login = (path: string, email: string, password: string) =>
    request(app.getHttpServer()).post(path).send({ email, password });

  it('échecs comptés et compteur partagé entre /login, /login/client et /login/proprio', async () => {
    const email = testData.ownerUser.email;
    const routes = ['/api/auth/login', '/api/auth/login/client', '/api/auth/login/proprio'];

    for (let i = 0; i < 5; i++) {
      expect((await login(routes[i % 3], email, 'mauvais-mot-de-passe')).status).toBe(401);
    }
    // Bon mot de passe, sur la route du rôle du compte : bloqué malgré tout.
    const blocked = await login('/api/auth/login/proprio', email, TEST_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body).not.toHaveProperty('access_token');
  });

  it('le blocage d’un compte ne bloque pas un autre compte depuis la même IP', async () => {
    const response = await login('/api/auth/login', testData.clientUser.email, TEST_PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('access_token');
  });

  it('aucune limite par IP seule dans ce lot : 31 e-mails différents ne sont pas bloqués', async () => {
    for (let i = 0; i < 31; i++) {
      expect((await login('/api/auth/login', testData.email(`ip-only-${i}`), 'mauvais-mot-de-passe')).status).toBe(401);
    }
  });
});
