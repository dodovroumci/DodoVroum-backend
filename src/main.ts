import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MonitoringInterceptor } from './monitoring/interceptors/monitoring.interceptor';
import { CacheConfigModule } from './cache/cache.module';
import { LoggingModule } from './logging/logging.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true, // Activer le body parser JSON
  });

  // Augmenter la limite de taille du body (par défaut 100kb)
  // 10MB pour permettre l'upload de données plus volumineuses (images en base64, etc.)
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.use(express.json({ limit: '10mb' }));
  expressInstance.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Préfixe global pour toutes les routes
  app.setGlobalPrefix('api');

  // Servir les fichiers statiques (uploads)
  const path = require('path');
  expressInstance.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Configuration CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Configuration des pipes de validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => {
          const constraints = error.constraints || {};
          return Object.values(constraints).join(', ');
        });
        return new BadRequestException({
          statusCode: 400,
          message: messages,
          error: 'Bad Request',
        });
      },
    }),
  );

  // Filtre d'exception global
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Intercepteurs globaux
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  // Import du module pour que Nest puisse résoudre le provider
  app.select(MonitoringModule);

  // Utilisation globale du MonitoringInterceptor
  app.useGlobalInterceptors(app.get(MonitoringInterceptor));

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('DodoVroum API')
    .setDescription('API pour la plateforme de réservation DodoVroum')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentification')
    .addTag('users', 'Utilisateurs')
    .addTag('residences', 'Résidences')
    .addTag('vehicles', 'Véhicules')
    .addTag('offers', 'Offres combinées')
    .addTag('bookings', 'Réservations')
    .addTag('payments', 'Paiements')
    .addTag('reviews', 'Avis')
    .addTag('favorites', 'Favoris')
    .addTag('search', 'Recherche globale')
    .addTag('upload', 'Upload de fichiers')
    .addTag('identity-verification', 'Vérification d\'identité')
    .addTag('admin', 'Administration')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Serveur DodoVroum démarré sur le port ${port}`);
  console.log(`📚 Documentation API disponible sur http://localhost:${port}/api`);
}

bootstrap();
