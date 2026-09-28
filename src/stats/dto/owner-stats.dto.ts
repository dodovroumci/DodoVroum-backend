import { ApiProperty } from '@nestjs/swagger';
import { FinanceSummaryDto } from './finance-summary.dto';

export class OwnerStatsDto {
  @ApiProperty({ description: 'Nombre de résidences actives du propriétaire' })
  totalResidences: number;

  @ApiProperty({ description: 'Nombre de véhicules actifs du propriétaire' })
  totalVehicles: number;

  @ApiProperty({ description: 'Nombre d’offres actives du propriétaire' })
  totalOffers: number;

  @ApiProperty({ description: 'Réservations liées aux biens du propriétaire' })
  totalBookings: number;

  @ApiProperty({
    description: 'Argent encaissé : somme des paiements COMPLETED non marqués à rembourser',
  })
  totalRevenue: number;

  @ApiProperty({
    description: 'Argent encaissé depuis le 1er du mois (UTC), selon la date de paiement (paidAt)',
  })
  monthRevenue: number;

  @ApiProperty({ type: FinanceSummaryDto, description: 'Revenus réalisés / en attente (commission 10 %, propriétaire 90 %)' })
  finance: FinanceSummaryDto;
}
