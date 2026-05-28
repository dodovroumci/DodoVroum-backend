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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { VehiclesQueryDto } from './dto/vehicles-query.dto';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/create-vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async create(@Body() createVehicleDto: CreateVehicleDto, @GetUser() user: any) {
    return this.vehiclesService.create(createVehicleDto, user);
  }

  @Get('types')
  async findAllTypes() {
    return this.vehiclesService.findAllTypes();
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
}
