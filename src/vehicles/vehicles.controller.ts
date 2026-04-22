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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Vehicles')
@Controller('vehicles')
export class VehiclesController {
  private readonly logger = new Logger(VehiclesController.name);

  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async findAll(@Query() query: any, @GetUser() user: any) {
    // Si l'utilisateur n'est pas ADMIN, il ne peut voir que ses propres véhicules.
    const ownerId = user.role !== 'ADMIN' ? user.id : query.proprietaireId;
    return this.vehiclesService.findAll(query, ownerId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async create(@Body() createVehicleDto: any, @GetUser() user: any) {
    // Nettoyage "guerilla": on exclut explicitement les identifiants propriétaire entrants.
    const { ownerId, proprietaireId, ...cleanData } = createVehicleDto;
    void ownerId;
    void proprietaireId;

    this.logger.debug(`Create vehicle payload keys: ${Object.keys(cleanData).join(',')}`);

    return this.vehiclesService.create(cleanData, user);
  }

  @Get('types')
  async findAllTypes() {
    return this.vehiclesService.findAllTypes();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @ApiBearerAuth()
  async update(@Param('id') id: string, @Body() updateData: any, @Request() req: any) {
    this.logger.log(`[PATCH] Update request for vehicle ${id}`);
    const result = await this.vehiclesService.update(id, updateData, req.user);
    this.logger.log(`[PATCH] Success. Title in response: ${result.title}`);
    return result;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
