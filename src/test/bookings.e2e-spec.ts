import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { TestUtils } from '../test/test-utils';

describe('BookingsController (e2e)', () => {
  let app: INestApplication;
  let testData: any;
  let authToken: string;

  beforeAll(async () => {
    app = await TestUtils.createTestApp();
    testData = await TestUtils.seedTestData();
    authToken = await TestUtils.getAuthToken(app, 'client@test.com', 'password123');
  });

  afterAll(async () => {
    await TestUtils.cleanupDatabase();
    await TestUtils.closeTestApp(app);
  });

  describe('/bookings (POST)', () => {
    it('should create a booking successfully', async () => {
      const bookingData = {
        startDate: '2024-07-01T00:00:00Z',
        endDate: '2024-07-07T23:59:59Z',
        residenceId: testData.testResidence.id,
        notes: 'Test booking',
      };

      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.residenceId).toBe(testData.testResidence.id);
      expect(response.body.data.userId).toBe(testData.clientUser.id);
    });

    it('should fail without authentication', async () => {
      const bookingData = {
        startDate: '2024-07-01T00:00:00Z',
        endDate: '2024-07-07T23:59:59Z',
        residenceId: testData.testResidence.id,
      };

      await request(app.getHttpServer())
        .post('/bookings')
        .send(bookingData)
        .expect(401);
    });

    it('should fail with invalid dates', async () => {
      const bookingData = {
        startDate: '2024-07-07T00:00:00Z', // End date before start date
        endDate: '2024-07-01T23:59:59Z',
        residenceId: testData.testResidence.id,
      };

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(400);
    });

    it('should fail with past dates', async () => {
      const bookingData = {
        startDate: '2020-01-01T00:00:00Z', // Past date
        endDate: '2020-01-07T23:59:59Z',
        residenceId: testData.testResidence.id,
      };

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(400);
    });

    it('should fail with non-existent residence', async () => {
      const bookingData = {
        startDate: '2024-07-01T00:00:00Z',
        endDate: '2024-07-07T23:59:59Z',
        residenceId: 'non-existent-id',
      };

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(400);
    });
  });

  describe('/bookings/my-bookings (GET)', () => {
    it('should return user bookings', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .expect(401);
    });
  });

  describe('/bookings/:id (GET)', () => {
    let bookingId: string;

    beforeAll(async () => {
      // Create a booking first
      const bookingData = {
        startDate: '2024-08-01T00:00:00Z',
        endDate: '2024-08-07T23:59:59Z',
        residenceId: testData.testResidence.id,
      };

      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData);

      bookingId = response.body.data.id;
    });

    it('should return booking details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(bookingId);
    });

    it('should fail with non-existent booking', async () => {
      await request(app.getHttpServer())
        .get('/bookings/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
