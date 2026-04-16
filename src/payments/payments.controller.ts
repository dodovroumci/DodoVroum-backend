import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  Request, 
  HttpCode, 
  HttpStatus,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController { // <--- VÉRIFIE BIEN LE "export" ICI
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.create(createPaymentDto, req.user.id);
  }

  @Get('my-payments')
  findMyPayments(@Request() req) {
    return this.paymentsService.findByUser(req.user.id);
  }

  @Post('bookings/:bookingId/geniuspay/init')
  @HttpCode(HttpStatus.CREATED)
  initializeGeniusPay(
    @Param('bookingId') bookingId: string,
    @Body() body: { paymentType?: string },
    @Request() req: any,
  ) {
    return this.paymentsService.initializeGeniusPayPayment(
      bookingId,
      req.user.id,
      body?.paymentType,
    );
  }

  @Public() // Indispensable pour que GeniusPay puisse y accéder
  @Get('redirect/success')
  async handleSuccessRedirect(
    @Query('reference') reference: string,
    @Query('bookingId') bookingId: string,
    @Res() res: any,
  ) {
    // Le bookingId est le paramètre critique pour reconnecter la réservation côté Flutter
    void reference;
    const deepLink = `dodovroum://payments/callback?status=success&bookingId=${bookingId}`;
    return res.redirect(deepLink);
  }

  @Public() // Indispensable pour que GeniusPay puisse y accéder
  @Get('redirect/cancel')
  async handleCancelRedirect(
    @Query('reference') reference: string,
    @Query('bookingId') bookingId: string,
    @Res() res: any,
  ) {
    void reference;
    const deepLink = `dodovroum://payments/callback?status=cancel&bookingId=${bookingId}`;
    return res.redirect(deepLink);
  }

  @Get('status/:id')
  @ApiOperation({ summary: 'Vérifier le statut de paiement d’une réservation' })
  @ApiResponse({ status: 200, description: 'Statut de paiement récupéré' })
  checkPaymentStatus(@Param('id') id: string) {
    return this.paymentsService.checkPaymentStatus(id);
  }

  @Get()
  findAll() { return this.paymentsService.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.paymentsService.findOne(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) { return this.paymentsService.update(id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.paymentsService.remove(id); }
}
