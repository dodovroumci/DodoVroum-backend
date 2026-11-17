import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { getRequestId } from './request-context';

export type PartnerApiErrorCode =
  | 'INVALID_PARAMETER'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_API_KEY'
  | 'RESIDENCE_NOT_FOUND'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Erreur métier des API publique/partenaire : code stable + message destiné au client. */
export class PartnerApiException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: PartnerApiErrorCode,
    message: string,
  ) {
    super({ code, message }, status);
  }
}

export const residenceNotFound = () =>
  new PartnerApiException(
    HttpStatus.NOT_FOUND,
    'RESIDENCE_NOT_FOUND',
    'Résidence introuvable.',
  );

export const invalidDateRange = (message: string) =>
  new PartnerApiException(
    HttpStatus.BAD_REQUEST,
    'INVALID_DATE_RANGE',
    message,
  );

export const invalidParameter = (message: string) =>
  new PartnerApiException(HttpStatus.BAD_REQUEST, 'INVALID_PARAMETER', message);

/**
 * Forme unique des erreurs : { error: { code, message, requestId } }.
 * Remplace le GlobalExceptionFilter sur ces contrôleurs : ni chemin, ni méthode,
 * ni détail interne (Prisma, pile) dans la réponse.
 */
@Catch()
export class PartnerApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PartnerApi');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);

    const { status, code, message } = this.describe(exception);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `requestId=${requestId} erreur interne`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Une erreur (404, 429, 500…) ne doit jamais être mise en cache par un intermédiaire.
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({ error: { code, message, requestId } });
  }

  private describe(exception: unknown): {
    status: number;
    code: PartnerApiErrorCode;
    message: string;
  } {
    if (exception instanceof PartnerApiException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: this.messageOf(exception),
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message:
          'Trop de requêtes. Réessayez après le délai indiqué par Retry-After.',
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.BAD_REQUEST) {
        // Messages de class-validator : décrivent le paramètre fautif, rien d'interne.
        return {
          status,
          code: 'INVALID_PARAMETER',
          message: this.messageOf(exception),
        };
      }
      if (status === HttpStatus.NOT_FOUND) {
        return { status, code: 'NOT_FOUND', message: 'Ressource introuvable.' };
      }
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Erreur interne. Réessayez plus tard.',
    };
  }

  private messageOf(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const raw = (body as { message?: unknown }).message;
    if (Array.isArray(raw)) return raw.map(String).join('. ');
    return typeof raw === 'string' ? raw : 'Requête invalide.';
  }
}
