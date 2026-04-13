import { Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';

@Injectable()
export class AppLoggerService implements LoggerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  log(message: string, context?: string, meta?: any) {
    this.logger.log(message, context, meta);
  }

  error(message: string, trace?: string, context?: string, meta?: any) {
    this.logger.error(message, trace, context, meta);
  }

  warn(message: string, context?: string, meta?: any) {
    this.logger.warn(message, context, meta);
  }

  debug(message: string, context?: string, meta?: any) {
    this.logger.debug(message, context, meta);
  }

  verbose(message: string, context?: string, meta?: any) {
    this.logger.verbose(message, context, meta);
  }

  // Méthodes spécialisées pour différents types de logs
  logHttpRequest(method: string, url: string, statusCode: number, responseTime: number, userAgent?: string) {
    this.log('HTTP Request', 'HTTP', {
      method,
      url,
      statusCode,
      responseTime: `${responseTime}ms`,
      userAgent,
    });
  }

  logDatabaseQuery(operation: string, table: string, duration: number, success: boolean) {
    const level = success ? 'debug' : 'error';
    this.logger[level](`Database Query`, 'DATABASE', {
      operation,
      table,
      duration: `${duration}ms`,
      success,
    });
  }

  logAuthEvent(event: string, userId?: string, email?: string, success: boolean = true) {
    const level = success ? 'info' : 'warn';
    this.logger[level](`Auth Event: ${event}`, 'AUTH', {
      event,
      userId,
      email,
      success,
    });
  }

  logBusinessEvent(event: string, entityType: string, entityId: string, userId?: string, meta?: any) {
    this.log(`Business Event: ${event}`, 'BUSINESS', {
      event,
      entityType,
      entityId,
      userId,
      ...meta,
    });
  }

  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', meta?: any) {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this.logger[level](`Security Event: ${event}`, 'SECURITY', {
      event,
      severity,
      ...meta,
    });
  }

  logPerformanceMetric(metric: string, value: number, unit: string = 'ms', meta?: any) {
    this.log(`Performance Metric: ${metric}`, 'PERFORMANCE', {
      metric,
      value,
      unit,
      ...meta,
    });
  }
}
