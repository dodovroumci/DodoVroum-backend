/**
 * @file date-overlap.util.ts
 * @description Utilitaires de comparaison de plages de dates.
 *
 * Convention : les plages sont [start, end[ pour les comparaisons pures (strict),
 * c'est-à-dire que deux plages contiguës (endA == startB) ne se chevauchent PAS.
 * Ce comportement correspond au modèle checkout/check-in d'une plateforme de location.
 *
 * @example
 *   [1 juin → 7 juin] et [7 juin → 10 juin] → CONTIGUËS, pas de conflit ✅
 *   [1 juin → 8 juin] et [7 juin → 10 juin] → OVERLAP, conflit ❌
 */

// ---------------------------------------------------------------------------
// Fonctions pures (in-memory) — utilisables dans les tests unitaires et les
// gardes JS avant un appel Prisma.
// ---------------------------------------------------------------------------

/**
 * Détermine si deux plages de dates se chevauchent.
 *
 * Algorithme : deux plages [A, B[ et [C, D[ se chevauchent si et seulement si
 * A < D && B > C (aucune n'est entièrement avant l'autre).
 *
 * @param startA Début de la première plage (inclus)
 * @param endA   Fin de la première plage (exclus)
 * @param startB Début de la deuxième plage (inclus)
 * @param endB   Fin de la deuxième plage (exclus)
 */
export function isDateOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Vérifie que la plage [inner] est entièrement contenue dans [outer].
 * Utilisé pour valider que les dates de réservation respectent la fenêtre
 * de validité d'une offre combinée (validFrom ≤ startDate et endDate ≤ validTo).
 *
 * @param inner Plage à vérifier (dates de réservation)
 * @param outer Plage conteneur (fenêtre de validité de l'offre)
 *
 * @example
 *   // Offre du 1 au 30 juin, réservation du 5 au 15 juin → true ✅
 *   isWithinDateRange(
 *     { start: new Date('2024-06-05'), end: new Date('2024-06-15') },
 *     { start: new Date('2024-06-01'), end: new Date('2024-06-30') },
 *   );
 *
 *   // Réservation dépasse la fin de l'offre → false ❌
 *   isWithinDateRange(
 *     { start: new Date('2024-06-25'), end: new Date('2024-07-05') },
 *     { start: new Date('2024-06-01'), end: new Date('2024-06-30') },
 *   );
 */
export function isWithinDateRange(
  inner: { start: Date; end: Date },
  outer: { start: Date; end: Date },
): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

// ---------------------------------------------------------------------------
// Condition Prisma réutilisable — équivalent DB de isDateOverlap().
// Décompose en 3 sous-cas pour que Prisma (MySQL) puisse utiliser les index
// sur (startDate, endDate).
// ---------------------------------------------------------------------------

/**
 * Construit la condition Prisma `{ OR: [...] }` détectant un chevauchement
 * avec la plage [start, end[.
 *
 * Les trois cas couverts :
 *  1. Chevauchement au début  : existante.début ≤ start < existante.fin
 *  2. Chevauchement à la fin  : start < existante.début < end
 *  3. Contenu                 : start ≤ existante.début et existante.fin ≤ end
 *
 * Sémantique identique à `isDateOverlap(start, end, existante.début, existante.fin)`.
 *
 * @param start Date de début de la plage candidate
 * @param end   Date de fin de la plage candidate
 *
 * @example
 *   // Dans une requête Prisma :
 *   prisma.booking.findFirst({
 *     where: {
 *       residenceId,
 *       ...buildDateOverlapCondition(new Date(startDate), new Date(endDate)),
 *     },
 *   });
 */
export function buildDateOverlapCondition(start: Date, end: Date) {
  return {
    OR: [
      // 1. La réservation existante commence avant et se termine dans notre plage
      { AND: [{ startDate: { lte: start } }, { endDate: { gt: start } }] },
      // 2. La réservation existante commence dans notre plage et se termine après
      { AND: [{ startDate: { lt: end } }, { endDate: { gte: end } }] },
      // 3. La réservation existante est entièrement contenue dans notre plage
      { AND: [{ startDate: { gte: start } }, { endDate: { lte: end } }] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers de formatage pour les messages d'erreur lisibles.
// ---------------------------------------------------------------------------

/** Formate une date en "1 juin 2024" (fr-FR). */
export function formatDateFR(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
