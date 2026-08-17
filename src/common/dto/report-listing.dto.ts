import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsIvorianPhone } from '../validators/ivorian-phone.validator';

export class ReportListingDto {
  @ApiProperty({ example: 'client@example.com' })
  @IsEmail()
  reporterEmail: string;

  @ApiProperty({ example: '0102030405', required: false })
  @IsOptional()
  @IsIvorianPhone()
  reporterPhone?: string;

  @ApiProperty({ example: "L'annonce ne correspond pas du tout aux photos." })
  @IsString()
  @MinLength(10, { message: 'Merci de préciser le motif du signalement (10 caractères minimum)' })
  reason: string;
}
