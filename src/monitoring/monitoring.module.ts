import { Module } from '@nestjs/common';
import { MonitoringInterceptor } from './interceptors/monitoring.interceptor';
import { MetricsService } from './metrics/metrics.service';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  controllers: [MetricsController],
  providers: [MonitoringInterceptor, MetricsService],
  exports: [MonitoringInterceptor, MetricsService],
})
export class MonitoringModule {}
