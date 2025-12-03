import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VerificationStatus } from '@prisma/client';

export class UpdateVerificationStatusDto {
  @ApiProperty({ 
    enum: VerificationStatus,
    example: VerificationStatus.VERIFIED,
    description: 'Nouveau statut de vérification'
  })
  @IsEnum(VerificationStatus, { message: 'Statut de vérification invalide' })
  verificationStatus: VerificationStatus;

  @ApiProperty({ 
    example: 'Document non lisible ou expiré',
    description: 'Raison du rejet si le statut est REJECTED',
    required: false
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

