import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Logger,
  Delete,
  Param,
  HttpStatus,
  HttpCode,
  Patch,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { VehiclesQueryDto } from './dto/vehicles-query.dto';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/create-vehicle.dto';
import { BlockDateDto } from './dto/block-date.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PartnerGuard } from '../common/guards/partner.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { ModerateListingDto } from '../common/dto/moderate-listing.dto';
import { ReportListingDto } from '../common/dto/report-listing.dto';

@ApiTags('Vehicles')
@Controller('vehicles')
export class VehiclesController {
  private readonly logger = new Logger(VehiclesController.name);

  constructor(private readonly vehiclesService: VehiclesService) {}

  /**
   * @description Recupere la liste des vehicules.
   * Accessible sans authentification pour permettre la recherche mobile.
   */
  @Get()
  @Public() // 👈 Autorise l'acces sans token
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Liste tous les vehicules disponibles' })
  async findAll(@Query() query: VehiclesQueryDto, @Request() req: any) {
    // Public listing — show all active vehicles regardless of who is calling.
    // ownerId filter is only applied when explicitly passed as a query param.
    const ownerId = query.proprietaireId ?? undefined;
    return this.vehiclesService.findAll(query, ownerId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PartnerGuard)
  @ApiBearerAuth()
  async create(@Body() createVehicleDto: CreateVehicleDto, @GetUser() user: any) {
    const targetOwnerId = (user.role === 'ADMIN' && createVehicleDto.ownerId)
      ? createVehicleDto.ownerId
      : user.id;

    return this.vehiclesService.create(createVehicleDto, targetOwnerId);
  }

  @Patch(':id/moderation')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Modérer une annonce véhicule (masquer/suspendre/réactiver) — admin uniquement" })
  async moderate(@Param('id') id: string, @Body() dto: ModerateListingDto) {
    return this.vehiclesService.setModerationStatus(id, dto.status);
  }

  @Post(':id/report')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Signaler une annonce véhicule (public)' })
  async report(@Param('id') id: string, @Body() dto: ReportListingDto) {
    return this.vehiclesService.reportListing(id, dto);
  }

  @Get('types')
  async findAllTypes() {
    return this.vehiclesService.findAllTypes();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Récupère un véhicule par ID' })
  async findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Get(':vehicleId/booked-dates')
  @Public()
  @ApiOperation({ summary: 'Retourne les plages de dates bloquées pour un véhicule' })
  async getBookedDates(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.getVehicleBookedRanges(vehicleId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @ApiBearerAuth()
  async update(@Param('id') id: string, @Body() updateData: UpdateVehicleDto, @Request() req: any) {
    return this.vehiclesService.update(id, updateData, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }

  @Post(':id/blocked-dates')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bloquer des dates pour un véhicule' })
  async blockDates(@Param('id') id: string, @Body() blockDateDto: BlockDateDto) {
    return this.vehiclesService.blockDates(id, blockDateDto);
  }

  @Get(':id/blocked-dates')
  @Public()
  @ApiOperation({ summary: "Récupérer toutes les dates bloquées d'un véhicule" })
  async getBlockedDates(@Param('id') id: string) {
    return this.vehiclesService.getBlockedDates(id);
  }

  @Delete(':id/blocked-dates/:blockedDateId')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer une période de dates bloquées' })
  async unblockDates(@Param('id') id: string, @Param('blockedDateId') blockedDateId: string) {
    return this.vehiclesService.unblockDates(id, blockedDateId);
  }
}
