import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TEST_PASSWORD, TestData, TestUtils } from '../test/test-utils';

describe('Security Tests (e2e)', () => {
  let app: INestApplication;
  let testData: TestData;
  // Une seule connexion par compte : la limite de connexion (IP + email) ne doit pas fausser les autres tests.
  let clientToken: string;

  beforeAll(async () => {
    app = await TestUtils.createTestApp();
    testData = await TestUtils.seedTestData();
    clientToken = await TestUtils.getAuthToken(app, testData.clientUser.email);
  });

  afterAll(async () => {
    if (testData) await TestUtils.cleanupTestData(testData);
    if (app) await TestUtils.closeTestApp(app);
  });

  describe('Rate Limiting', () => {
    it('should limit login attempts', async () => {
      // Compte dédié : la limite (IP + email) ne doit pas bloquer les connexions des autres tests.
      const loginData = {
        email: testData.email('rate-limit-login'),
        password: 'wrongpassword',
      };

      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send(loginData);

        if (i < 5) {
          expect(response.status).toBe(401);
        } else {
          // 6th attempt should be rate limited
          expect(response.status).toBe(429);
        }
      }
    });

    it('should limit registration attempts per IP + email', async () => {
      // Politique actuelle (AuthThrottlerGuard) : 3 tentatives par IP + email sur 5 minutes.
      // Il n'existe pas de limite par IP seule sur l'inscription (décision de conception en attente).
      const registerData = {
        email: testData.email('register-limit'),
        password: TEST_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
      };

      const responses: request.Response[] = [];
      for (let i = 0; i < 4; i++) {
        responses.push(await request(app.getHttpServer()).post('/api/auth/register').send(registerData));
      }

      // 1re : créé ; 2e et 3e : email déjà utilisé ; 4e : bloquée avant tout traitement.
      expect(responses.map((response) => response.status)).toEqual([201, 400, 400, 429]);
      expect(responses[3].headers['retry-after']).toBeDefined();

      // Le compteur est propre à l'email : un autre email depuis la même IP n'est pas bloqué.
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...registerData, email: testData.email('register-limit-other') })
        .expect(201);
    });
  });

  describe('Authentication Security', () => {
    it('should reject requests without proper authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/bookings/my-bookings')
        .expect(401);
    });

    it('should reject requests with malformed authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/bookings/my-bookings')
        .set('Authorization', 'InvalidToken')
        .expect(401);
    });

    it('should reject requests with expired token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await request(app.getHttpServer())
        .get('/api/bookings/my-bookings')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection in email field', async () => {
      const maliciousData = {
        email: "'; DROP TABLE users; --",
        password: TEST_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(maliciousData);

      // Should fail validation, not execute SQL
      expect(response.status).toBe(400);
    });

    it('should treat HTML in text fields as plain data returned only as JSON', async () => {
      // L'API ne produit aucun rendu HTML : elle conserve la chaîne telle quelle et la renvoie en JSON.
      // La protection contre le XSS relève de l'échappement à l'affichage (dashboard Vue, e-mails,
      // application) : ce test ne garantit rien sur le rendu des interfaces.
      const htmlPayload = '<script>alert("xss")</script>';

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testData.email('xss'),
          password: TEST_PASSWORD,
          firstName: htmlPayload,
          lastName: 'User',
        })
        .expect(201);

      expect(registerResponse.headers['content-type']).toMatch(/^application\/json/);
      expect(registerResponse.body.user.firstName).toBe(htmlPayload);

      const meResponse = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registerResponse.body.access_token}`)
        .expect(200);

      expect(meResponse.headers['content-type']).toMatch(/^application\/json/);
      expect(meResponse.body.firstName).toBe(htmlPayload);
    });

    it('should prevent NoSQL injection', async () => {
      const maliciousData = {
        startDate: TestUtils.dateInDays(30),
        endDate: TestUtils.dateInDays(36),
        residenceId: { $ne: null }, // NoSQL injection attempt
      };

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(maliciousData);

      // Should fail validation
      expect(response.status).toBe(400);
    });
  });

  describe('Authorization Security', () => {
    let adminToken: string;

    beforeAll(async () => {
      adminToken = await TestUtils.getAuthToken(app, testData.adminUser.email);
    });

    it('should prevent clients from accessing admin-only endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/users') // Admin endpoint
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403); // Forbidden
    });

    it('should allow admins to access admin-only endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/users') // Admin endpoint
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent users from accessing other users data', async () => {
      // Create a booking for client user
      const bookingData = {
        startDate: TestUtils.dateInDays(70),
        endDate: TestUtils.dateInDays(76),
        residenceId: testData.testResidence.id,
      };

      const bookingResponse = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(bookingData)
        .expect(201);

      const bookingId = bookingResponse.body.id;

      // Try to access with admin token (should work for admin)
      await request(app.getHttpServer())
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Try to access with different client token (should fail)
      const anotherClientToken = await TestUtils.getAuthToken(app, testData.otherClientUser.email);
      await request(app.getHttpServer())
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${anotherClientToken}`)
        .expect(403);
    });
  });

  describe('Data Exposure Security', () => {
    it('should not expose sensitive user data in responses', async () => {
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ startDate: TestUtils.dateInDays(80), endDate: TestUtils.dateInDays(86), residenceId: testData.testResidence.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/bookings/my-bookings')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      // Aucun secret de compte, à aucun niveau de la réponse.
      expect(response.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(response.body)).not.toMatch(/"(password|refreshTokenHash|resetPasswordToken)"/);
    });

    it('should not expose internal database IDs in error messages', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/bookings/non-existent-id')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(404);

      // Error message should not contain internal details
      expect(response.body.message).not.toContain('database');
      expect(response.body.message).not.toContain('prisma');
    });
  });
});
