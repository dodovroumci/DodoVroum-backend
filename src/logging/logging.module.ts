import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { AppLoggerService } from './app-logger.service';

@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const environment = configService.get<string>('NODE_ENV', 'development');
        const logLevel = configService.get<string>('LOG_LEVEL', 'info');

        const transports: winston.transport[] = [
          // Console transport
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
                return `${timestamp} [${context || 'Application'}] ${level}: ${message} ${
                  Object.keys(meta).length ? JSON.stringify(meta) : ''
                }`;
              }),
            ),
          }),
        ];

        // Ajouter le transport fichier en production
        if (environment === 'production') {
          transports.push(
            new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
            new winston.transports.File({
              filename: 'logs/combined.log',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
          );
        }

        return {
          level: logLevel,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
          transports,
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggingModule {}
