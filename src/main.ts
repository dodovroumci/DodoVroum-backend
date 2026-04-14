import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Derrière nginx / load balancer : req.ip et X-Forwarded-For fiables pour la whitelist webhook
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', true);
    logger.log('Trust proxy activé (TRUST_PROXY) — IP client fiable pour les webhooks');
  }

  // 1. Configuration CORS - Mise à jour pour inclure le Dashboard Local
  app.enableCors({
    origin: [
      'https://dodovroum.com',
      'https://www.dodovroum.com',
      'http://localhost:5173', // <--- INDISPENSABLE pour votre Dashboard local
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Autorise l'envoi des cookies/headers d'auth
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // 2. Sécurité : Helmet
  app.use(helmet({
    contentSecurityPolicy: false, 
  }));

  // 3. Préfixe global pour les endpoints DATA
  // Toutes vos routes seront sous https://api.dodovroum.com/api/...
  app.setGlobalPrefix('api');

  // 4. Pipes de validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true
  }));

  // 5. Documentation Swagger - Sortie du préfixe 'api' pour éviter les conflits
  const config = new DocumentBuilder()
    .setTitle('DodoVroum API')
    .setDescription('Documentation technique unifiée')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  // Swagger sera sur https://api.dodovroum.com/docs (plus propre)
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'DodoVroum API Docs',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 API: https://api.dodovroum.com/api`);
  logger.log(`📖 Docs: https://api.dodovroum.com/docs`);
}
bootstrap();
