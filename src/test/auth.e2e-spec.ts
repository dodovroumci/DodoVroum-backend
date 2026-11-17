import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TEST_PASSWORD, TestData, TestUtils } from '../test/test-utils';

describe('AuthController (e2e)', () => {
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

  describe('/api/auth/register (POST)', () => {
    it('should register a new user successfully', async () => {
      const registerData = {
        email: testData.email('newuser'),
        password: TEST_PASSWORD,
        firstName: 'New',
        lastName: 'User',
        phone: '+1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.user.email).toBe(registerData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should fail with invalid email', async () => {
      const registerData = {
        email: 'invalid-email',
        password: TEST_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should fail with short password', async () => {
      const registerData = {
        email: testData.email('short-password'),
        password: '123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should fail when user already exists', async () => {
      const registerData = {
        email: testData.clientUser.email, // Already exists in test data
        password: TEST_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerData)
        .expect(400);
    });
  });

  describe('/api/auth/login (POST)', () => {
    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: testData.clientUser.email,
        password: TEST_PASSWORD,
      };

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should fail with invalid credentials', async () => {
      const loginData = {
        email: testData.clientUser.email,
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);
    });

    it('should fail with non-existent user', async () => {
      const loginData = {
        email: testData.email('nonexistent'),
        password: TEST_PASSWORD,
      };

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);
    });
  });

  describe('/api/auth/refresh (POST)', () => {
    it('should refresh token successfully', async () => {
      // First login to get refresh token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testData.clientUser.email,
          password: TEST_PASSWORD,
        })
        .expect(200);

      const refreshToken = loginResponse.body.refresh_token;

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
    });

    it('should fail with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: 'invalid-token' })
        .expect(401);
    });
  });
});
