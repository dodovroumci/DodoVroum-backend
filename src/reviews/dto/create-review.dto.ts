import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Excellent séjour !', required: false })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ example: 'uuid-du-booking' })
  @IsString()
  bookingId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  residenceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;
}
