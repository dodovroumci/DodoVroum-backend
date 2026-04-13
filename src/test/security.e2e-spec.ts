import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { TestUtils } from '../test/test-utils';

describe('Security Tests (e2e)', () => {
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

  describe('Rate Limiting', () => {
    it('should limit login attempts', async () => {
      const loginData = {
        email: 'client@test.com',
        password: 'wrongpassword',
      };

      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginData);

        if (i < 5) {
          expect(response.status).toBe(401);
        } else {
          // 6th attempt should be rate limited
          expect(response.status).toBe(429);
        }
      }
    });

    it('should limit registration attempts', async () => {
      const registerData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      // Make multiple registration attempts
      for (let i = 0; i < 4; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            ...registerData,
            email: `test${i}@example.com`,
          });

        if (i < 3) {
          expect([201, 400]).toContain(response.status);
        } else {
          // 4th attempt should be rate limited
          expect(response.status).toBe(429);
        }
      }
    });
  });

  describe('Authentication Security', () => {
    it('should reject requests without proper authorization header', async () => {
      await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .expect(401);
    });

    it('should reject requests with malformed authorization header', async () => {
      await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .set('Authorization', 'InvalidToken')
        .expect(401);
    });

    it('should reject requests with expired token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection in email field', async () => {
      const maliciousData = {
        email: "'; DROP TABLE users; --",
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(maliciousData);

      // Should fail validation, not execute SQL
      expect(response.status).toBe(400);
    });

    it('should prevent XSS in text fields', async () => {
      const maliciousData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: '<script>alert("xss")</script>',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(maliciousData);

      // Should fail validation
      expect(response.status).toBe(400);
    });

    it('should prevent NoSQL injection', async () => {
      const maliciousData = {
        startDate: '2024-07-01T00:00:00Z',
        endDate: '2024-07-07T23:59:59Z',
        residenceId: { $ne: null }, // NoSQL injection attempt
      };

      const authToken = await TestUtils.getAuthToken(app, 'client@test.com', 'password123');

      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(maliciousData);

      // Should fail validation
      expect(response.status).toBe(400);
    });
  });

  describe('Authorization Security', () => {
    let clientToken: string;
    let adminToken: string;

    beforeAll(async () => {
      clientToken = await TestUtils.getAuthToken(app, 'client@test.com', 'password123');
      adminToken = await TestUtils.getAuthToken(app, 'admin@test.com', 'password123');
    });

    it('should prevent clients from accessing admin-only endpoints', async () => {
      // Assuming there's an admin-only endpoint
      await request(app.getHttpServer())
        .get('/users') // Admin endpoint
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403); // Forbidden
    });

    it('should allow admins to access admin-only endpoints', async () => {
      await request(app.getHttpServer())
        .get('/users') // Admin endpoint
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should prevent users from accessing other users data', async () => {
      // Create a booking for client user
      const bookingData = {
        startDate: '2024-09-01T00:00:00Z',
        endDate: '2024-09-07T23:59:59Z',
        residenceId: testData.testResidence.id,
      };

      const bookingResponse = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(bookingData);

      const bookingId = bookingResponse.body.data.id;

      // Try to access with admin token (should work for admin)
      await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Try to access with different client token (should fail)
      const anotherClientToken = await TestUtils.getAuthToken(app, 'newuser@test.com', 'password123');
      await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${anotherClientToken}`)
        .expect(403);
    });
  });

  describe('Data Exposure Security', () => {
    it('should not expose sensitive user data in responses', async () => {
      const authToken = await TestUtils.getAuthToken(app, 'client@test.com', 'password123');

      const response = await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check that password is not exposed
      if (response.body.data.length > 0) {
        const booking = response.body.data[0];
        if (booking.user) {
          expect(booking.user).not.toHaveProperty('password');
        }
      }
    });

    it('should not expose internal database IDs in error messages', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/non-existent-id')
        .set('Authorization', `Bearer ${await TestUtils.getAuthToken(app, 'client@test.com', 'password123')}`)
        .expect(404);

      // Error message should not contain internal details
      expect(response.body.message).not.toContain('database');
      expect(response.body.message).not.toContain('prisma');
    });
  });
});
