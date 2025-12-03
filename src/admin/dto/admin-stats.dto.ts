import { ApiProperty } from '@nestjs/swagger';

export class AdminStatsDto {
  @ApiProperty({ example: 150 })
  totalUsers: number;

  @ApiProperty({ example: 45 })
  totalResidences: number;

  @ApiProperty({ example: 30 })
  totalVehicles: number;

  @ApiProperty({ example: 25 })
  totalOffers: number;

  @ApiProperty({ example: 200 })
  totalBookings: number;

  @ApiProperty({ example: 150 })
  totalPayments: number;

  @ApiProperty({ example: 5000000 })
  totalRevenue: number;

  @ApiProperty({ example: 50 })
  pendingBookings: number;

  @ApiProperty({ example: 10 })
  pendingIdentityVerifications: number;

  @ApiProperty({ example: 120 })
  activeUsers: number;

  @ApiProperty({ example: 5 })
  totalAdmins: number;

  @ApiProperty({ example: 20 })
  totalProprietaires: number;
}

