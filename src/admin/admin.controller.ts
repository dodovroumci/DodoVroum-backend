import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminStatsDto } from './dto/admin-stats.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ 
    summary: 'Obtenir les statistiques globales de la plateforme',
    description: 'Retourne un résumé des statistiques de la plateforme (utilisateurs, réservations, revenus, etc.). Réservé aux administrateurs.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Statistiques récupérées avec succès',
    type: AdminStatsDto,
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Accès refusé - Réservé aux administrateurs' 
  })
  async getStats(): Promise<AdminStatsDto> {
    return this.adminService.getStats();
  }

  @Get('bookings/recent')
  @ApiOperation({ 
    summary: 'Obtenir les réservations récentes',
    description: 'Retourne les réservations les plus récentes avec leurs détails. Réservé aux administrateurs.'
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Nombre de réservations à retourner (défaut: 10)',
    example: 10,
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Réservations récentes récupérées avec succès',
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Accès refusé - Réservé aux administrateurs' 
  })
  async getRecentBookings(@Query('limit') limit?: string) {
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.adminService.getRecentBookings(limitNumber);
  }
}

