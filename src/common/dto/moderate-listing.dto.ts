import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ListingModerationStatus } from '@prisma/client';

export class ModerateListingDto {
  @ApiProperty({ enum: ListingModerationStatus, example: ListingModerationStatus.HIDDEN })
  @IsEnum(ListingModerationStatus)
  status: ListingModerationStatus;
}
