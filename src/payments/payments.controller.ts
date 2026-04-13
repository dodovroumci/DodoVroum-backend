import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un paiement' })
  @ApiResponse({ status: 201, description: 'Paiement créé avec succès' })
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.create(createPaymentDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Obtenir tous les paiements' })
  @ApiResponse({ status: 200, description: 'Liste des paiements' })
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get('my-payments')
  @ApiOperation({ summary: 'Obtenir mes paiements' })
  @ApiResponse({ status: 200, description: 'Liste de mes paiements' })
  findMyPayments(@Request() req) {
    return this.paymentsService.findByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un paiement par ID' })
  @ApiResponse({ status: 200, description: 'Paiement trouvé' })
  @ApiResponse({ status: 404, description: 'Paiement non trouvé' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un paiement' })
  @ApiResponse({ status: 200, description: 'Paiement mis à jour' })
  @ApiResponse({ status: 404, description: 'Paiement non trouvé' })
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(id, updatePaymentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un paiement' })
  @ApiResponse({ status: 200, description: 'Paiement supprimé' })
  @ApiResponse({ status: 404, description: 'Paiement non trouvé' })
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
