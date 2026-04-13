import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly authErrorCache = new Map<string, number>();
  private readonly AUTH_ERROR_LOG_INTERVAL = 60000; // 1 minute

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else {
        message = (exceptionResponse as any).message || exceptionResponse;
        error = (exceptionResponse as any).error || exception.name;
      }
    } else if ((exception as any)?.code === 'P2002') {
      // Erreur Prisma : contrainte d'unicité violée
      status = HttpStatus.BAD_REQUEST;
      const field = (exception as any).meta?.target?.[0] || 'champ';
      message = `Cette ${field} est déjà utilisée`;
      error = 'BadRequestException';
      
      this.logger.warn(
        `Contrainte d'unicité violée: ${field}`,
        (exception as any).stack,
      );
    } else if ((exception as any)?.code?.startsWith('P')) {
      // Autre erreur Prisma
      status = HttpStatus.BAD_REQUEST;
      message = process.env.NODE_ENV === 'development'
        ? `Erreur base de données: ${(exception as any).message}`
        : 'Erreur lors du traitement de la requête';
      error = 'DatabaseError';
      
      this.logger.error(
        `Erreur Prisma: ${(exception as any).code} - ${(exception as any).message}`,
        (exception as any).stack,
      );
    } else {
      // Erreur non gérée
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      
      // En développement, afficher plus de détails
      if (process.env.NODE_ENV === 'development') {
        message = exception instanceof Error ? exception.message : String(exception);
        error = exception instanceof Error ? exception.name : 'InternalServerError';
        
        // Logger l'erreur complète pour le debugging
        this.logger.error(
          `Erreur non gérée: ${exception}`,
          exception instanceof Error ? exception.stack : undefined,
        );
      } else {
        message = 'Erreur interne du serveur';
        error = 'InternalServerError';
        
        // Logger l'erreur pour le debugging (sans exposer les détails)
        this.logger.error(
          `Erreur non gérée: ${exception}`,
          exception instanceof Error ? exception.stack : undefined,
        );
      }
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error,
      message,
    };

    // Gérer les logs différemment selon le type d'erreur
    const isAuthError = status === HttpStatus.UNAUTHORIZED;
    const userAgent = request.headers['user-agent'] || '';
    const isSwaggerRequest = userAgent.includes('swagger') || 
                             userAgent.includes('Swagger') ||
                             request.url.includes('/api-json') ||
                             request.url.includes('/api-yaml');
    
    // Pour les erreurs 401, réduire le bruit dans les logs
    if (isAuthError) {
      const cacheKey = `${request.method}:${request.url}`;
      const now = Date.now();
      const lastLogTime = this.authErrorCache.get(cacheKey) || 0;
      
      // Logger seulement si c'est la première fois ou après l'intervalle
      if (now - lastLogTime > this.AUTH_ERROR_LOG_INTERVAL) {
        if (isSwaggerRequest) {
          // Swagger fait beaucoup de requêtes de test, logger seulement en debug
          this.logger.debug(
            `[Swagger] ${request.method} ${request.url} - ${status} - Authentification requise`,
          );
        } else {
          // Pour les vraies requêtes, logger en warn
          this.logger.warn(
            `${request.method} ${request.url} - ${status} - ${JSON.stringify(errorResponse)}`,
          );
        }
        this.authErrorCache.set(cacheKey, now);
      }
    } else {
      // Pour les autres erreurs, logger normalement
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${JSON.stringify(errorResponse)}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
