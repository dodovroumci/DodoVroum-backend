import { invalidDateRange } from './partner-api.errors';

/**
 * Séjour [checkIn, checkOut[ en dates calendaires (YYYY-MM-DD, minuit UTC).
 * Mêmes bornes que BookingValidationService.validateDates : arrivée aujourd'hui
 * (UTC) ou plus tard, départ après l'arrivée, 30 nuits au plus.
 */
export const MAX_NIGHTS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface Stay {
  start: Date;
  end: Date;
  nights: number;
  checkIn: string;
  checkOut: string;
}

/** Date calendaire réelle (refuse 2026-02-30), sinon null. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

export function parseStay(
  checkIn: string,
  checkOut: string,
  now: Date = new Date(),
): Stay {
  const start = parseIsoDate(checkIn);
  const end = parseIsoDate(checkOut);
  if (!start || !end)
    throw invalidDateRange(
      'checkIn et checkOut doivent être des dates valides au format YYYY-MM-DD.',
    );

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (start.getTime() < today)
    throw invalidDateRange('checkIn ne peut pas être dans le passé.');
  if (end <= start) throw invalidDateRange('checkOut doit être après checkIn.');

  const nights = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (nights > MAX_NIGHTS)
    throw invalidDateRange(
      `Le séjour ne peut pas dépasser ${MAX_NIGHTS} nuits.`,
    );

  return { start, end, nights, checkIn, checkOut };
}
