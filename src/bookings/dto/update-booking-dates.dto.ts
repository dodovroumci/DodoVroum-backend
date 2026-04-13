import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class UpdateBookingDatesDto {
  @ApiProperty({ example: '2024-06-01T00:00:00Z', description: 'Nouvelle date de début' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-06-07T23:59:59Z', description: 'Nouvelle date de fin' })
  @IsDateString()
  endDate: string;
}
