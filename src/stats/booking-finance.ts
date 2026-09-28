/**
 * Règles financières DodoVroum — source de vérité unique (API + dashboard).
 *
 * Montants calculés sur la valeur TOTALE de la réservation (totalPrice),
 * indépendamment de la part payée en ligne (acompte 30 % ou paiement 100 %) :
 *   volume = 100 % · commission DodoVroum = 10 % · revenu propriétaire = 90 %
 *   ex. 100 000 → commission 10 000 → propriétaire 90 000.
 *
 * Deux déclencheurs distincts :
 * - DodoVroum (volume + commission) : comptabilisé dès la confirmation du
 *   propriétaire (ownerConfirmedAt). Pas de notion « en attente » côté DodoVroum.
 * - Propriétaire (90 %) :
 *   · EN ATTENTE avant la remise des clés (réservation payée ou confirmée) ;
 *   · RÉALISÉ le jour de la remise des clés (EN_COURS_SEJOUR, puis COMPLETED après
 *     check-out). Les deux chemins de remise (client : confirmKeyRetrieval,
 *     propriétaire : confirmOwnerKeyHandover) réécrivent ownerConfirmedAt à cet
 *     instant ; le chemin client renseigne aussi keyRetrievedAt.
 * Une réservation annulée ou expirée (toujours avant confirmation) ne compte nulle part.
 *
 * L'argent encaissé en ligne (onlinePaid) et le reste payé sur place au
 * propriétaire (remainingOnSite) sont des informations de paiement distinctes :
 * ils n'entrent pas dans le calcul du volume, de la commission ni du revenu.
 */

/** Commission DodoVroum, en pourcentage entier de la valeur de la réservation. */
export const COMMISSION_RATE_PERCENT = 10;

export type OwnerRevenueState = 'REALIZED' | 'PENDING' | 'NONE';
export type PlatformRevenueState = 'REALIZED' | 'NONE';

export type FinancePayment = {
  amount: number;
  status: string;
  refundRequiredAt: Date | null;
};

export type FinanceBooking = {
  totalPrice: number;
  status: string;
  ownerConfirmedAt: Date | null;
  keyRetrievedAt?: Date | null;
  payments?: FinancePayment[];
};

export interface BookingFinance {
  /** Volume de la réservation : 100 % de totalPrice. */
  bookingValue: number;
  /** Commission DodoVroum : 10 % de totalPrice (arrondi au FCFA). */
  commission: number;
  /** Revenu propriétaire : totalPrice − commission (90 %). */
  ownerRevenue: number;
  /** Encaissé en ligne : paiements COMPLETED non marqués à rembourser. */
  onlinePaid: number;
  /** Reste payé sur place au propriétaire : totalPrice − encaissé en ligne. */
  remainingOnSite: number;
  /** Revenu propriétaire : réalisé à la remise des clés, en attente avant. */
  ownerState: OwnerRevenueState;
  /** Jour de la remise des clés (comptabilisation du revenu propriétaire), sinon null. */
  ownerRealizedAt: Date | null;
  /** Volume et commission DodoVroum : réalisés dès la confirmation du propriétaire. */
  platformState: PlatformRevenueState;
  /** Date de comptabilisation DodoVroum (ownerConfirmedAt), sinon null. */
  platformRealizedAt: Date | null;
}

/** Commission DodoVroum d'une réservation, arrondie au FCFA le plus proche. */
export const commissionOf = (totalPrice: number): number =>
  Math.round((Number(totalPrice) * COMMISSION_RATE_PERCENT) / 100);

/** Argent réellement encaissé : COMPLETED et non marqué à rembourser. */
export const isCollectedPayment = (p: FinancePayment): boolean =>
  p.status === 'COMPLETED' && !p.refundRequiredAt;

const NEVER_REALIZED_STATUSES = ['CANCELLED', 'EXPIRED'];
/** Statuts atteints uniquement après la remise des clés (check-out : depuis EN_COURS_SEJOUR / ONGOING). */
const KEYS_HANDED_OVER_STATUSES = ['EN_COURS_SEJOUR', 'ONGOING', 'COMPLETED'];

const statusOf = (booking: FinanceBooking) => String(booking.status ?? '').toUpperCase();

/** Jour de la remise des clés : keyRetrievedAt, sinon ownerConfirmedAt (réécrit à la remise). */
export const keyHandoverDateOf = (booking: FinanceBooking): Date | null => {
  if (!KEYS_HANDED_OVER_STATUSES.includes(statusOf(booking))) return null;
  return booking.keyRetrievedAt ?? booking.ownerConfirmedAt ?? null;
};

export function ownerRevenueStateOf(booking: FinanceBooking): OwnerRevenueState {
  if (keyHandoverDateOf(booking)) return 'REALIZED';
  if (NEVER_REALIZED_STATUSES.includes(statusOf(booking))) return 'NONE';
  const paid = (booking.payments ?? []).some(isCollectedPayment);
  return paid || booking.ownerConfirmedAt ? 'PENDING' : 'NONE';
}

export function platformRevenueStateOf(booking: FinanceBooking): PlatformRevenueState {
  if (NEVER_REALIZED_STATUSES.includes(statusOf(booking))) return 'NONE';
  return booking.ownerConfirmedAt ? 'REALIZED' : 'NONE';
}

/** Montants financiers d'une réservation. */
export function bookingFinance(booking: FinanceBooking): BookingFinance {
  const bookingValue = Number(booking.totalPrice) || 0;
  const commission = commissionOf(bookingValue);
  const onlinePaid = (booking.payments ?? [])
    .filter(isCollectedPayment)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const ownerState = ownerRevenueStateOf(booking);
  const platformState = platformRevenueStateOf(booking);

  return {
    bookingValue,
    commission,
    ownerRevenue: bookingValue - commission,
    onlinePaid,
    remainingOnSite: Math.max(bookingValue - onlinePaid, 0),
    ownerState,
    ownerRealizedAt: ownerState === 'REALIZED' ? keyHandoverDateOf(booking) : null,
    platformState,
    platformRealizedAt: platformState === 'REALIZED' ? booking.ownerConfirmedAt : null,
  };
}

export interface PlatformAmounts {
  bookingValue: number;
  commission: number;
}

export interface FinanceSummary {
  /** Revenu propriétaire (90 %). */
  owner: {
    /** Réalisé : clés remises. */
    realized: number;
    /** Réalisé ce mois-ci : clés remises depuis le 1er du mois (00:00 UTC). */
    realizedMonth: number;
    /** En attente : payée ou confirmée, clés pas encore remises. */
    pending: number;
  };
  /** Volume (100 %) et commission DodoVroum (10 %), dès la confirmation du propriétaire. */
  platform: {
    realized: PlatformAmounts;
    /** Confirmées depuis le 1er du mois (00:00 UTC). */
    realizedMonth: PlatformAmounts;
  };
}

/** Premier jour du mois courant, 00:00 UTC (Abidjan = UTC toute l'année). */
export const startOfMonthUtc = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Agrégat propriétaire / DodoVroum d'un ensemble de réservations. */
export function summarizeFinance(bookings: FinanceBooking[], now: Date = new Date()): FinanceSummary {
  const monthStart = startOfMonthUtc(now);
  const inMonth = (d: Date | null) => !!d && d >= monthStart && d <= now;
  const summary: FinanceSummary = {
    owner: { realized: 0, realizedMonth: 0, pending: 0 },
    platform: { realized: { bookingValue: 0, commission: 0 }, realizedMonth: { bookingValue: 0, commission: 0 } },
  };

  for (const booking of bookings) {
    const f = bookingFinance(booking);

    if (f.ownerState === 'REALIZED') {
      summary.owner.realized += f.ownerRevenue;
      if (inMonth(f.ownerRealizedAt)) summary.owner.realizedMonth += f.ownerRevenue;
    } else if (f.ownerState === 'PENDING') {
      summary.owner.pending += f.ownerRevenue;
    }

    if (f.platformState === 'REALIZED') {
      summary.platform.realized.bookingValue += f.bookingValue;
      summary.platform.realized.commission += f.commission;
      if (inMonth(f.platformRealizedAt)) {
        summary.platform.realizedMonth.bookingValue += f.bookingValue;
        summary.platform.realizedMonth.commission += f.commission;
      }
    }
  }

  return summary;
}

/** Sélection Prisma minimale pour summarizeFinance. */
export const FINANCE_BOOKING_SELECT = {
  totalPrice: true,
  status: true,
  ownerConfirmedAt: true,
  keyRetrievedAt: true,
  payments: { select: { amount: true, status: true, refundRequiredAt: true } },
} as const;
