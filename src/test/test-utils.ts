import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module';
import * as request from 'supertest';

export class TestUtils {
  static async createTestApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    
    // Configuration similaire à main.ts mais pour les tests
    app.useGlobalPipes(
      new (await import('@nestjs/common')).ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    return app;
  }

  static async closeTestApp(app: INestApplication): Promise<void> {
    await app.close();
  }

  static async cleanupDatabase(): Promise<void> {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Supprimer les données dans l'ordre inverse des dépendances
    await prisma.review.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.residence.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.user.deleteMany();

    await prisma.$disconnect();
  }

  static async seedTestData(): Promise<{
    adminUser: any;
    clientUser: any;
    testResidence: any;
    testVehicle: any;
  }> {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Créer des utilisateurs de test
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8Kz8KzK', // 'password123'
        firstName: 'Admin',
        lastName: 'Test',
        role: 'ADMIN',
      },
    });

    const clientUser = await prisma.user.create({
      data: {
        email: 'client@test.com',
        password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8Kz8KzK', // 'password123'
        firstName: 'Client',
        lastName: 'Test',
        role: 'CLIENT',
      },
    });

    // Créer une résidence de test
    const testResidence = await prisma.residence.create({
      data: {
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

    await prisma.$disconnect();

    return {
      adminUser,
      clientUser,
      testResidence,
      testVehicle,
    };
  }

  static async getAuthToken(app: INestApplication, email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    return response.body.access_token;
  }
}
