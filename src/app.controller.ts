import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * @description Contrôleur système pour le Health Check.
 * Aligné sur la racine du préfixe global /api.
 */
@ApiTags('System')
@Controller('') // On définit une route vide pour matcher /api
export class AppController {
  
  @Get() // Matchera exactement GET /api
  @ApiOperation({ summary: 'Health Check du serveur' })
  getHealth() {
    return {
      status: 'success',
      message: '🚀 SERVEUR DODOVROUM OPÉRATIONNEL',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()) + 's',
      environment: process.env.NODE_ENV || 'development'
    };
  }
}
