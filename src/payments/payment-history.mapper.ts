import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import {
  CurrencyAmountsDto,
  PaymentHistoryBookingDto,
  PaymentHistoryBookingType,
  PaymentHistoryPaymentDto,
  PaymentHistoryResponseDto,
  PaymentHistoryState,
} from './dto/payment-history.dto';

/**
 * Historique des paiements d'un client (GET /payments/history).
 *
 * Fonctions pures : aucune dépendance Nest/Prisma à l'exécution, testables seules.
 * Règles (validées) :
 * - classement d'un Payment : REFUNDED > REFUND_DUE > COLLECTED > PENDING > NOT_COMPLETED ;
 *   refundRequiredAt ne vaut jamais « remboursé » ;
 * - montants toujours agrégés PAR DEVISE, devise réelle conservée, aucune conversion ;
 * - total dépensé = Σ COLLECTED (encaissé et conservé) ;
 * - réservation listée si au moins un paiement COLLECTED / REFUND_DUE / REFUNDED ;
 * - seuls les paiements de l'utilisateur sont pris en compte (double filtrage,
 *   aussi appliqué dans la requête Prisma).
 */

/**
 * Lecture depuis les paiements (`prisma.payment`, client sans extension) et non
 * depuis `prisma.booking` : l'extension de suppression logique force
 * `deletedAt: null` sur `booking.findMany`, ce qui masquerait les réservations
 * supprimées et leurs paiements. Le filtre sur la relation `booking` n'est pas
 * réécrit par cette extension.
 *
 * Double filtrage : le paiement ET sa réservation appartiennent à l'utilisateur.
 */
export const paymentHistoryWhere = (userId: string) =>
  ({ userId, booking: { userId } }) satisfies Prisma.PaymentWhereInput;

/** Champs lus en base — liste blanche explicite (aucun include complet). */
export const paymentHistorySelect = {
  id: true,
  userId: true,
  amount: true,
  currency: true,
  status: true,
  method: true,
  paymentOption: true,
  transactionId: true,
  createdAt: true,
  paidAt: true,
  refundRequiredAt: true,
  refundReason: true,
  booking: {
    select: {
      id: true,
      userId: true,
      status: true,
      totalPrice: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      deletedAt: true,
      residence: { select: { id: true, title: true, images: true } },
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          title: true,
          images: true,
        },
      },
      offer: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          residence: { select: { images: true } },
        },
      },
    },
  },
} satisfies Prisma.PaymentSelect;

/** Un paiement lu en base, avec sa réservation. */
export type PaymentHistoryRow = Prisma.PaymentGetPayload<{
  select: typeof paymentHistorySelect;
}>;
type PaymentRow = PaymentHistoryRow;
type BookingRow = PaymentHistoryRow['booking'];

export interface PaymentHistoryLogger {
  warn(message: string): unknown;
}

/** Statuts où un règlement est encore possible : solde restant calculé. */
export const REMAINING_BALANCE_STATUSES: ReadonlySet<BookingStatus> =
  new Set<BookingStatus>([
    BookingStatus.AWAITING_PAYMENT,
    BookingStatus.PENDING,
    BookingStatus.PAID,
    BookingStatus.CONFIRMED,
    BookingStatus.CONFIRMEE,
  ]);

/** Devise de référence des prix de réservation (totalPrice n'a pas de colonne devise). */
export const BOOKING_PRICE_CURRENCY = 'XOF';

const MONEY_STATES: ReadonlySet<PaymentHistoryState> =
  new Set<PaymentHistoryState>(['COLLECTED', 'REFUND_DUE', 'REFUNDED']);

export function classifyPayment(payment: {
  status: PaymentStatus;
  refundRequiredAt: Date | null;
}): PaymentHistoryState {
  switch (payment.status) {
    case PaymentStatus.REFUNDED:
      return 'REFUNDED';
    case PaymentStatus.COMPLETED:
      return payment.refundRequiredAt ? 'REFUND_DUE' : 'COLLECTED';
    case PaymentStatus.PENDING:
      return 'PENDING';
    case PaymentStatus.FAILED:
    default:
      return 'NOT_COMPLETED';
  }
}

/** Première image : tableau, JSON sérialisé ou liste séparée par des virgules. */
function firstImage(images: unknown): string | null {
  if (!images) return null;
  if (Array.isArray(images)) {
    const first = images.find((i) => typeof i === 'string' && i.trim() !== '');
    return first ? String(first).trim() : null;
  }
  if (typeof images === 'string') {
    const raw = images.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return firstImage(parsed);
      if (typeof parsed === 'string') return parsed.trim() || null;
    } catch {
      // pas du JSON : liste séparée par des virgules
    }
    return raw.split(',')[0].trim() || null;
  }
  return null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function describeBooking(row: BookingRow): {
  type: PaymentHistoryBookingType;
  title: string;
  imageUrl: string | null;
} {
  // Offre combinée en premier : elle peut aussi porter une résidence.
  if (row.offer) {
    return {
      type: 'OFFER',
      title: row.offer.title || 'Offre',
      imageUrl: row.offer.imageUrl || firstImage(row.offer.residence?.images),
    };
  }
  if (row.vehicle) {
    const name = `${row.vehicle.brand ?? ''} ${row.vehicle.model ?? ''}`.trim();
    return {
      type: 'VEHICLE',
      title: name || row.vehicle.title || 'Véhicule',
      imageUrl: firstImage(row.vehicle.images),
    };
  }
  return {
    type: 'RESIDENCE',
    title: row.residence?.title || 'Résidence',
    imageUrl: firstImage(row.residence?.images),
  };
}

function currencyOf(
  payment: PaymentRow,
  logger?: PaymentHistoryLogger,
): string {
  const currency = payment.currency ?? '';
  if (currency.trim() === '') {
    logger?.warn(
      `[PAYMENT_HISTORY] devise vide pour le paiement ${payment.id}`,
    );
  }
  return currency;
}

function toPaymentDto(
  payment: PaymentRow,
  logger?: PaymentHistoryLogger,
): PaymentHistoryPaymentDto {
  const state = classifyPayment(payment);
  const moneyReceived = MONEY_STATES.has(state);
  return {
    id: payment.id,
    state,
    amount: payment.amount,
    currency: currencyOf(payment, logger),
    paymentOption: payment.paymentOption ?? null,
    // Avant encaissement, `method` est une valeur provisoire (CARD) : non exposée.
    method: moneyReceived ? (payment.method ?? null) : null,
    transactionId: payment.transactionId ?? null,
    createdAt: iso(payment.createdAt),
    paidAt: moneyReceived ? iso(payment.paidAt) : null,
    refundRequiredAt: iso(payment.refundRequiredAt),
    refundReason: payment.refundReason ?? null,
  };
}

/** Agrège les montants par devise (ordre : première apparition). */
export function sumByCurrency(
  payments: PaymentHistoryPaymentDto[],
): CurrencyAmountsDto[] {
  const byCurrency = new Map<string, CurrencyAmountsDto>();
  for (const p of payments) {
    if (!MONEY_STATES.has(p.state)) continue;
    let entry = byCurrency.get(p.currency);
    if (!entry) {
      entry = { currency: p.currency, collected: 0, refundDue: 0, refunded: 0 };
      byCurrency.set(p.currency, entry);
    }
    if (p.state === 'COLLECTED') entry.collected += p.amount;
    else if (p.state === 'REFUND_DUE') entry.refundDue += p.amount;
    else entry.refunded += p.amount;
  }
  return [...byCurrency.values()];
}

/**
 * Reste à régler, ou null :
 * - null si le statut ne permet plus de règlement (séjour commencé, terminé,
 *   annulé, expiré, inconnu) ;
 * - null si un paiement encaissé n'est pas en XOF (aucune conversion) ;
 * - sinon max(totalPrice − Σ COLLECTED, 0).
 */
export function computeRemainingBalance(
  status: BookingStatus,
  totalPrice: number,
  payments: PaymentHistoryPaymentDto[],
  context?: { bookingId: string; logger?: PaymentHistoryLogger },
): number | null {
  if (!REMAINING_BALANCE_STATUSES.has(status)) return null;
  const collected = payments.filter((p) => p.state === 'COLLECTED');
  if (collected.some((p) => p.currency !== BOOKING_PRICE_CURRENCY)) {
    context?.logger?.warn(
      `[PAYMENT_HISTORY] solde non calculé pour ${context.bookingId} : paiement encaissé hors ${BOOKING_PRICE_CURRENCY}`,
    );
    return null;
  }
  const paid = collected.reduce((sum, p) => sum + p.amount, 0);
  return Math.max(totalPrice - paid, 0);
}

function lastMoneyActivity(payments: PaymentHistoryPaymentDto[]): number {
  return payments
    .filter((p) => MONEY_STATES.has(p.state))
    .reduce((max, p) => Math.max(max, Date.parse(p.paidAt ?? p.createdAt)), 0);
}

/**
 * Regroupe les paiements par réservation, en ne gardant que les paiements de
 * [userId] rattachés à une réservation de [userId] (défense en profondeur, en
 * plus du filtre Prisma). Ordre : première apparition.
 */
function groupByBooking(
  rows: PaymentHistoryRow[],
  userId: string,
): { booking: BookingRow; payments: PaymentRow[] }[] {
  const groups = new Map<
    string,
    { booking: BookingRow; payments: PaymentRow[] }
  >();
  for (const row of rows) {
    if (row.userId !== userId) continue;
    if (!row.booking || row.booking.userId !== userId) continue;
    let group = groups.get(row.booking.id);
    if (!group) {
      group = { booking: row.booking, payments: [] };
      groups.set(row.booking.id, group);
    }
    group.payments.push(row);
  }
  return [...groups.values()];
}

/**
 * Construit l'historique de [userId] à partir des paiements lus en base.
 * Les paiements d'un autre utilisateur, ou rattachés à la réservation d'un
 * autre utilisateur, sont ignorés.
 */
export function buildPaymentHistory(
  rows: PaymentHistoryRow[],
  userId: string,
  logger?: PaymentHistoryLogger,
): PaymentHistoryResponseDto {
  const entries: {
    dto: PaymentHistoryBookingDto;
    activity: number;
    createdAt: number;
  }[] = [];

  for (const { booking: row, payments: paymentRows } of groupByBooking(
    rows,
    userId,
  )) {
    const payments = paymentRows
      .map((p) => toPaymentDto(p, logger))
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          a.id.localeCompare(b.id),
      );

    if (!payments.some((p) => MONEY_STATES.has(p.state))) continue;

    const { type, title, imageUrl } = describeBooking(row);
    entries.push({
      activity: lastMoneyActivity(payments),
      createdAt: Date.parse(iso(row.createdAt)),
      dto: {
        bookingId: row.id,
        bookingStatus: row.status,
        type,
        title,
        imageUrl,
        startDate: iso(row.startDate),
        endDate: iso(row.endDate),
        deleted: row.deletedAt != null,
        totalPrice: row.totalPrice,
        amounts: sumByCurrency(payments),
        remainingBalance: computeRemainingBalance(
          row.status,
          row.totalPrice,
          payments,
          {
            bookingId: row.id,
            logger,
          },
        ),
        payments,
      },
    });
  }

  entries.sort(
    (a, b) =>
      b.activity - a.activity ||
      b.createdAt - a.createdAt ||
      a.dto.bookingId.localeCompare(b.dto.bookingId),
  );

  const bookings = entries.map((e) => e.dto);
  return {
    totals: sumByCurrency(bookings.flatMap((b) => b.payments)),
    bookings,
  };
}
