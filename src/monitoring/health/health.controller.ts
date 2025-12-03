import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Vérifier la santé de l\'application' })
  @ApiResponse({ status: 200, description: 'Application en bonne santé' })
  @ApiResponse({ status: 503, description: 'Application en panne' })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Vérification détaillée de la santé' })
  @ApiResponse({ status: 200, description: 'État détaillé de l\'application' })
  async detailedCheck() {
    const startTime = Date.now();
    
    try {
      // Vérifier la base de données
      await this.prisma.$queryRaw`SELECT 1`;
      const dbResponseTime = Date.now() - startTime;

      // Vérifier la mémoire
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      };

      // Vérifier l'uptime
      const uptime = process.uptime();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: {
            status: 'healthy',
            responseTime: `${dbResponseTime}ms`,
          },
          memory: {
            status: memoryUsageMB.heapUsed < 500 ? 'healthy' : 'warning',
            usage: memoryUsageMB,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        services: {
          database: {
            status: 'unhealthy',
            error: error.message,
          },
        },
      };
    }
  }
}
