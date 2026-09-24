import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { CreatePaymentDto } from './create-payment.dto';

/**
 * Correction manuelle d'un paiement (PATCH admin uniquement). Mêmes champs
 * qu'avant : status et transactionId, retirés de la création, restent modifiables ici.
 */
export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {
  @ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Référence du prestataire de paiement' })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
