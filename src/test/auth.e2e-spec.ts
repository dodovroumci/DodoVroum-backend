import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { TestUtils } from '../test/test-utils';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let testData: any;

  beforeAll(async () => {
    app = await TestUtils.createTestApp();
    testData = await TestUtils.seedTestData();
  });

  afterAll(async () => {
    await TestUtils.cleanupDatabase();
    await TestUtils.closeTestApp(app);
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user successfully', async () => {
      const registerData = {
        email: 'newuser@test.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        phone: '+1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      expect(response.body.data.user.email).toBe(registerData.email);
    });

    it('should fail with invalid email', async () => {
      const registerData = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should fail with short password', async () => {
      const registerData = {
        email: 'test@example.com',
        password: '123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });

    it('should fail when user already exists', async () => {
      const registerData = {
        email: 'client@test.com', // Already exists in test data
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(400);
    });
  });

  describe('/auth/login (POST)', () => {
    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'client@test.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      expect(response.body.data.user.email).toBe(loginData.email);
    });

    it('should fail with invalid credentials', async () => {
      const loginData = {
        email: 'client@test.com',
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);
    });

    it('should fail with non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@test.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);
    });
  });

  describe('/auth/refresh (POST)', () => {
    it('should refresh token successfully', async () => {
      // First login to get refresh token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'client@test.com',
          password: 'password123',
        });

      const refreshToken = loginResponse.body.data.refresh_token;

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('access_token');
    });

    it('should fail with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: 'invalid-token' })
        .expect(401);
    });
  });
});
