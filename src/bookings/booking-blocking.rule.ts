import { BookingStatus, Prisma } from '@prisma/client';
import { buildDateOverlapCondition } from '../common/utils/date-overlap.util';

/**
 * Règle unique de blocage d'un créneau par une réservation.
 *
 * Utilisée à la création/modification d'une réservation (BookingValidationService)
 * et par les lectures de disponibilité (API publique/partenaire) : ne jamais la
 * dupliquer ailleurs, sinon une lecture peut annoncer « disponible » un créneau
 * qu'une réservation refuserait.
 */

/** Fenêtre pendant laquelle un booking `PENDING` / `AWAITING_PAYMENT` (paiement en cours) bloque le créneau. */
export const PAYMENT_HOLD_MS = 15 * 60 * 1000;

/** Statuts qui bloquent toujours le créneau. */
export const ALWAYS_BLOCKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PAID,
  BookingStatus.CONFIRMED,
  BookingStatus.CONFIRMEE,
  BookingStatus.CHECKIN_CLIENT,
  BookingStatus.CHECKIN_PROPRIO,
  BookingStatus.EN_COURS_SEJOUR,
  BookingStatus.ONGOING,
];

/** Statuts qui ne bloquent que pendant la fenêtre de paiement. */
export const PAYMENT_HOLD_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.AWAITING_PAYMENT,
];

/**
 * Filtre Prisma des réservations qui bloquent la plage [start, end[.
 * Deux plages contiguës ne conflictent pas (voir buildDateOverlapCondition).
 *
 * Les réservations supprimées logiquement sont exclues par l'extension soft-delete
 * sur `booking.findFirst/findMany` ; dans un filtre de relation (`some`/`none`),
 * l'appelant doit ajouter `deletedAt: null` lui-même.
 */
export function buildBlockingBookingWhere(
  start: Date,
  end: Date,
  now: Date = new Date(),
  excludeBookingId?: string,
): Prisma.BookingWhereInput {
  const pendingSince = new Date(now.getTime() - PAYMENT_HOLD_MS);

  return {
    ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    AND: [
      // Filtre statut : fermes toujours bloquants, PENDING seulement dans la fenêtre de paiement
      {
        OR: [
          { status: { in: [...ALWAYS_BLOCKING_STATUSES] } },
          {
            AND: [
              { status: { in: [...PAYMENT_HOLD_STATUSES] } },
              { createdAt: { gte: pendingSince } },
            ],
          },
        ],
      },
      // Filtre dates : chevauchement avec [start, end[
      buildDateOverlapCondition(start, end),
    ],
  };
}

/** Réservations qui occupent une résidence : directes ou via une offre combinée (pack). */
export function residenceBookingScope(
  residenceId: string,
): Prisma.BookingWhereInput {
  return { OR: [{ residenceId }, { offer: { residenceId } }] };
}
