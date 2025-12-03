import { Injectable } from '@nestjs/common';
import { Counter, register, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  public httpRequestsTotal: Counter<string>;

  constructor() {
    // Supprime les métriques existantes pour éviter les doublons
    register.clear();

    // Collecte des métriques par défaut Node.js
    collectDefaultMetrics({ prefix: 'dodovroum_', register });

    // Création d'un compteur HTTP
    this.httpRequestsTotal = new Counter({
      name: 'dodovroum_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register],
    });
  }
}
