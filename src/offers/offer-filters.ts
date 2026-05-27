/**
 * Filtres partagés pour les offres combinées — équivalent des "scopes" Laravel.
 *
 * Règles métier :
 *   - isActive: false  → offre désactivée manuellement (soft-delete)
 *   - isActive: true   → offre potentiellement visible
 *   - validTo < now    → offre expirée (même si isActive = true)
 *
 * Usage :
 *   prisma.offer.findMany({ where: { ...activeOfferWhere(), ownerId: '…' } })
 */

/**
 * Offre publiquement visible : active ET non expirée.
 * À utiliser dans tous les endpoints publics (findAll, search, findOne public).
 */
export const activeOfferWhere = () => ({
  isActive: true,
  validTo: { gte: new Date() },
});

/**
 * Offre non supprimée (mais potentiellement expirée) — vue propriétaire/admin.
 * Retourne les offres actives ET expirées (pour gestion), exclut uniquement les soft-deleted.
 */
export const nonDeletedOfferWhere = () => ({
  isActive: true,
});

/**
 * Offre utilisable pour une réservation : active, non expirée, et validée.
 */
export const bookableOfferWhere = () => ({
  isActive: true,
  isVerified: true,
  validTo: { gte: new Date() },
  validFrom: { lte: new Date() },
});

/**
 * Calcule le statut d'une offre à partir de ses champs.
 * Retourne un statut lisible pour le frontend.
 */
export type OfferStatus = 'ACTIVE' | 'EXPIREE' | 'INACTIVE';

export const computeOfferStatus = (offer: {
  isActive: boolean;
  validTo: Date;
  validFrom: Date;
}): OfferStatus => {
  if (!offer.isActive) return 'INACTIVE';
  if (new Date(offer.validTo) < new Date()) return 'EXPIREE';
  return 'ACTIVE';
};
