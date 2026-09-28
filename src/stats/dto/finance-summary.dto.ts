import { ApiProperty } from '@nestjs/swagger';

/** Revenu propriétaire (90 % du totalPrice) — voir src/stats/booking-finance.ts. */
export class OwnerFinanceDto {
  @ApiProperty({ example: 90000, description: 'Réalisé : clés remises' })
  realized: number;

  @ApiProperty({ example: 90000, description: 'Réalisé ce mois-ci : clés remises depuis le 1er du mois (UTC)' })
  realizedMonth: number;

  @ApiProperty({ example: 45000, description: 'En attente : réservation payée ou confirmée, clés pas encore remises' })
  pending: number;
}

/** Volume et commission DodoVroum. */
export class PlatformAmountsDto {
  @ApiProperty({ example: 100000, description: 'Volume : 100 % du totalPrice' })
  bookingValue: number;

  @ApiProperty({ example: 10000, description: 'Commission DodoVroum : 10 % du totalPrice' })
  commission: number;
}

/** DodoVroum : comptabilisé dès la confirmation du propriétaire (ownerConfirmedAt). */
export class PlatformFinanceDto {
  @ApiProperty({ type: PlatformAmountsDto, description: 'Réservations confirmées par le propriétaire' })
  realized: PlatformAmountsDto;

  @ApiProperty({ type: PlatformAmountsDto, description: 'Confirmées depuis le 1er du mois (UTC)' })
  realizedMonth: PlatformAmountsDto;
}

export class FinanceSummaryDto {
  @ApiProperty({ type: OwnerFinanceDto })
  owner: OwnerFinanceDto;

  @ApiProperty({ type: PlatformFinanceDto })
  platform: PlatformFinanceDto;
}
