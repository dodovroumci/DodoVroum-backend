import { ApiProperty } from '@nestjs/swagger';
import {
  BookingStatus,
  PaymentMethod,
  PaymentOption,
  RefundReason,
} from '@prisma/client';

/**
 * État monétaire d'un Payment, déduit uniquement des colonnes en base.
 * - COLLECTED     : COMPLETED, refundRequiredAt = null — encaissé et conservé
 * - REFUND_DUE    : COMPLETED, refundRequiredAt ≠ null — encaissé, remboursement dû (NON effectué)
 * - REFUNDED      : status = REFUNDED — remboursement confirmé
 * - PENDING       : PENDING — aucun argent reçu
 * - NOT_COMPLETED : FAILED — session remplacée / abandonnée, aucun argent reçu
 *                   (les échecs GeniusPay ne sont pas enregistrés : ce n'est pas un refus)
 */
export const PAYMENT_HISTORY_STATES = [
  'COLLECTED',
  'REFUND_DUE',
  'REFUNDED',
  'PENDING',
  'NOT_COMPLETED',
] as const;
export type PaymentHistoryState = (typeof PAYMENT_HISTORY_STATES)[number];

export type PaymentHistoryBookingType = 'RESIDENCE' | 'VEHICLE' | 'OFFER';

export class PaymentHistoryPaymentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PAYMENT_HISTORY_STATES })
  state: PaymentHistoryState;

  @ApiProperty({ description: 'Montant de ce paiement, dans sa devise' })
  amount: number;

  @ApiProperty({
    description: 'Devise réelle enregistrée (jamais convertie ni réécrite)',
  })
  currency: string;

  @ApiProperty({ enum: PaymentOption, nullable: true })
  paymentOption: PaymentOption | null;

  @ApiProperty({
    enum: PaymentMethod,
    nullable: true,
    description: 'null si jamais encaissé',
  })
  method: PaymentMethod | null;

  @ApiProperty({ nullable: true, description: 'Référence GeniusPay' })
  transactionId: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Remboursement dû depuis cette date — ne signifie pas remboursé',
  })
  refundRequiredAt: string | null;

  @ApiProperty({ enum: RefundReason, nullable: true })
  refundReason: RefundReason | null;
}

/** Montants d'une seule devise : aucune addition entre devises. */
export class CurrencyAmountsDto {
  @ApiProperty()
  currency: string;

  @ApiProperty({ description: 'Σ COLLECTED — encaissé et conservé' })
  collected: number;

  @ApiProperty({ description: 'Σ REFUND_DUE — à rembourser' })
  refundDue: number;

  @ApiProperty({ description: 'Σ REFUNDED — remboursé' })
  refunded: number;
}

export class PaymentHistoryBookingDto {
  @ApiProperty()
  bookingId: string;

  @ApiProperty({ enum: BookingStatus })
  bookingStatus: BookingStatus;

  @ApiProperty({ enum: ['RESIDENCE', 'VEHICLE', 'OFFER'] })
  type: PaymentHistoryBookingType;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startDate: string;

  @ApiProperty({ type: String, format: 'date-time' })
  endDate: string;

  @ApiProperty({
    description: 'Réservation supprimée (conservée dans l’historique)',
  })
  deleted: boolean;

  @ApiProperty({
    description: 'Prix de la réservation — jamais un montant payé',
  })
  totalPrice: number;

  @ApiProperty({ type: [CurrencyAmountsDto] })
  amounts: CurrencyAmountsDto[];

  @ApiProperty({
    nullable: true,
    description:
      'Reste à régler : seulement si un règlement est encore possible ' +
      '(AWAITING_PAYMENT, PENDING, PAID, CONFIRMED, CONFIRMEE) et si tous les ' +
      'paiements encaissés sont en XOF ; sinon null',
  })
  remainingBalance: number | null;

  @ApiProperty({ type: [PaymentHistoryPaymentDto] })
  payments: PaymentHistoryPaymentDto[];
}

export class PaymentHistoryResponseDto {
  @ApiProperty({
    type: [CurrencyAmountsDto],
    description: 'Totaux par devise ; total dépensé = collected',
  })
  totals: CurrencyAmountsDto[];

  @ApiProperty({ type: [PaymentHistoryBookingDto] })
  bookings: PaymentHistoryBookingDto[];
}
