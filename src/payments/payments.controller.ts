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
  HttpStatus 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
    @Request() req: any,
  ) {
    return this.paymentsService.initializeGeniusPayPayment(bookingId, req.user.id);
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
