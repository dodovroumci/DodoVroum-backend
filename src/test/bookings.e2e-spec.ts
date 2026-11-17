import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestData, TestUtils } from '../test/test-utils';

describe('BookingsController (e2e)', () => {
  let app: INestApplication;
  let testData: TestData;
  let authToken: string;
  let createdBookingId: string;

  beforeAll(async () => {
    app = await TestUtils.createTestApp();
    testData = await TestUtils.seedTestData();
    authToken = await TestUtils.getAuthToken(app, testData.clientUser.email);
  });

  afterAll(async () => {
    if (testData) await TestUtils.cleanupTestData(testData);
    if (app) await TestUtils.closeTestApp(app);
  });

  describe('/api/bookings (POST)', () => {
    it('should create a booking successfully', async () => {
      const bookingData = {
        startDate: TestUtils.dateInDays(30),
        endDate: TestUtils.dateInDays(36),
        residenceId: testData.testResidence.id,
        notes: 'Test booking',
      };

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.residence.id).toBe(testData.testResidence.id);
      createdBookingId = response.body.id;
    });

    it('should fail without authentication', async () => {
      const bookingData = {
        startDate: TestUtils.dateInDays(30),
        endDate: TestUtils.dateInDays(36),
        residenceId: testData.testResidence.id,
      };

      await request(app.getHttpServer())
        .post('/api/bookings')
        .send(bookingData)
        .expect(401);
    });

    it('should fail with invalid dates', async () => {
      const bookingData = {
        startDate: TestUtils.dateInDays(46), // End date before start date
        endDate: TestUtils.dateInDays(40),
        residenceId: testData.testResidence.id,
      };

      await request(app.getHttpServer())
        .post('/api/bookings')
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
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(400);
    });

    it('should fail with non-existent residence', async () => {
      const bookingData = {
        startDate: TestUtils.dateInDays(50),
        endDate: TestUtils.dateInDays(56),
        residenceId: 'non-existent-id',
      };

      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(400);
    });
  });

  describe('/api/bookings/my-bookings (GET)', () => {
    it('should return user bookings', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/bookings/my-bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // La réservation créée par ce client figure dans sa liste.
      expect(response.body.map((booking) => booking.id)).toContain(createdBookingId);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/bookings/my-bookings')
        .expect(401);
    });
  });

  describe('/api/bookings/:id (GET)', () => {
    let bookingId: string;

    beforeAll(async () => {
      // Create a booking first
      const bookingData = {
        startDate: TestUtils.dateInDays(60),
        endDate: TestUtils.dateInDays(66),
        residenceId: testData.testResidence.id,
      };

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(201);

      bookingId = response.body.id;
    });

    it('should return booking details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(bookingId);
    });

    it('should fail with non-existent booking', async () => {
      await request(app.getHttpServer())
        .get('/api/bookings/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
