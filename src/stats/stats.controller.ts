import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatsService } from './stats.service';
import { OwnerStatsDto } from './dto/owner-stats.dto';

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Statistiques du propriétaire connecté',
    description:
      "L’identifiant propriétaire est celui du JWT (req.user), jamais un paramètre d’URL.",
  })
  @ApiResponse({ status: 200, description: 'Statistiques agrégées', type: OwnerStatsDto })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getMyStats(@Req() req: { user: User }): Promise<OwnerStatsDto> {
    return this.statsService.getOwnerStats(req.user.id);
  }
}
