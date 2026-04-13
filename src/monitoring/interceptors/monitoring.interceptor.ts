import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const route = req.route?.path || req.url;

    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const statusCode = context.switchToHttp().getResponse().statusCode;
        this.metricsService.httpRequestsTotal.inc({ method, route, status_code: statusCode });
      }),
    );
  }
}

