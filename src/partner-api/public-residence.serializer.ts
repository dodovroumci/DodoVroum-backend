import { ListingModerationStatus, Prisma } from '@prisma/client';

/**
 * Sérialiseur public des résidences, partagé par l'API publique (page web /r/{id})
 * et l'API partenaire. C'est la seule source des champs exposés hors de DodoVroum :
 * tout champ ajouté ici devient public.
 *
 * Jamais exposés : adresse, coordonnées, propriétaire (id, identité, contacts),
 * statuts internes (isActive, moderationStatus, isVerified, deletedAt), dates
 * internes, description (V1), réservations, blocages, texte et auteurs des avis.
 */

/**
 * Résidences visibles hors de DodoVroum. Non éligible → 404, sans distinction.
 * Propriétaire actif et non supprimé : un assistant ne doit pas proposer un logement
 * que personne ne peut gérer. L'extension soft-delete ne s'applique pas aux filtres de
 * relation : deletedAt: null est explicite.
 */
export const ELIGIBLE_RESIDENCE_WHERE = {
  isActive: true,
  moderationStatus: ListingModerationStatus.ACTIVE,
  deletedAt: null,
  ownerId: { not: null },
  owner: { isActive: true, deletedAt: null },
} satisfies Prisma.ResidenceWhereInput;

/** Colonnes lues en base : liste blanche explicite, jamais la ligne complète. */
export const PUBLIC_RESIDENCE_SELECT = {
  id: true,
  title: true,
  typeResidence: true,
  city: true,
  country: true,
  pricePerDay: true,
  capacity: true,
  bedrooms: true,
  bathrooms: true,
  nombrePieces: true,
  amenities: true,
  images: true,
} satisfies Prisma.ResidenceSelect;

export type PublicResidenceRow = Prisma.ResidenceGetPayload<{
  select: typeof PUBLIC_RESIDENCE_SELECT;
}>;

/** Les prix sont en francs CFA (XOF), comme les paiements GeniusPay. */
export const PUBLIC_CURRENCY = 'XOF';

/** Origine canonique des pages résidence (Android App Links : hôte sans www). */
export const CANONICAL_ORIGIN = 'https://dodovroum.com';

/**
 * Origine qui sert réellement les fichiers (nginx du VPS) : toutes les URL d'images
 * renvoyées sont construites sur elle. dodovroum.com est le site statique : /storage
 * y répond 404.
 */
export const IMAGE_PUBLIC_ORIGIN = 'https://api.dodovroum.com';

/**
 * Origines acceptées dans les URL enregistrées en base : dodovroum.com (écrite par
 * l'upload et ResidencesService.parseImages) et l'origine réelle. Tout autre hôte est refusé.
 */
export const IMAGE_STORED_ORIGINS: ReadonlySet<string> = new Set([
  'https://dodovroum.com',
  IMAGE_PUBLIC_ORIGIN,
]);
export const IMAGE_STORAGE_PATH = '/storage/residences/';

/** Image de remplacement de parseImages : ce n'est pas une photo du logement. */
const PLACEHOLDER_IMAGE = 'default-residence.png';
const IMAGE_FILE_NAME =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp|gif|avif)$/i;
const HAS_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:|^\/\//;
const MAX_IMAGES = 20;

const MAX_AMENITY_LENGTH = 60;
const MAX_AMENITIES = 30;

export interface PublicRating {
  average: number | null;
  count: number;
}

export interface PublicResidenceSummary {
  id: string;
  title: string;
  typeResidence: string | null;
  city: string;
  country: string;
  pricePerNight: { amount: number; currency: string };
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  nombrePieces: number | null;
  coverImageUrl: string | null;
  rating: PublicRating;
  url: string;
}

export interface PublicResidenceDetail extends PublicResidenceSummary {
  amenities: string[];
  images: string[];
}

export const NO_RATING: PublicRating = Object.freeze({
  average: null,
  count: 0,
}) as PublicRating;

export function residenceUrl(id: string): string {
  return `${CANONICAL_ORIGIN}/r/${encodeURIComponent(id)}`;
}

/** Lit une colonne JSON-en-texte ; valeur illisible → tableau vide. */
function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) return trimmed ? [trimmed] : [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * URL publique d'une image si elle désigne un fichier du stockage DodoVroum, sinon null.
 * - URL absolue : uniquement <origine de IMAGE_STORED_ORIGINS>/storage/residences/<fichier>
 *   (pas d'autre hôte, pas de http, pas de port, d'identifiants, de requête ni de sous-dossier) ;
 * - chemin relatif : son nom de fichier, rattaché au stockage, comme le fait parseImages.
 * L'URL renvoyée est toujours reconstruite sur IMAGE_PUBLIC_ORIGIN.
 */
export function toStorageImageUrl(entry: unknown): string | null {
  if (typeof entry !== 'string') return null;
  const value = entry.trim();
  if (!value) return null;

  let fileName: string;
  if (HAS_SCHEME.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (
      !IMAGE_STORED_ORIGINS.has(url.origin) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(IMAGE_STORAGE_PATH)
    ) {
      return null;
    }
    fileName = url.pathname.slice(IMAGE_STORAGE_PATH.length);
  } else {
    fileName = value.split('/').pop() ?? '';
  }

  if (
    !IMAGE_FILE_NAME.test(fileName) ||
    fileName.toLowerCase() === PLACEHOLDER_IMAGE
  )
    return null;
  return `${IMAGE_PUBLIC_ORIGIN}${IMAGE_STORAGE_PATH}${fileName}`;
}

export function toPublicImages(images: unknown): string[] {
  const urls = parseJsonArray(images)
    .map(toStorageImageUrl)
    .filter((url): url is string => url !== null);
  return [...new Set(urls)].slice(0, MAX_IMAGES);
}

export function toPublicAmenities(amenities: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of parseJsonArray(amenities)) {
    if (typeof item !== 'string') continue;
    const label = item.replace(/\s+/g, ' ').trim();
    if (!label || label.length > MAX_AMENITY_LENGTH) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length === MAX_AMENITIES) break;
  }
  return result;
}

export function toPublicRating(
  average: number | null | undefined,
  count: number | null | undefined,
): PublicRating {
  if (!count || average === null || average === undefined)
    return { ...NO_RATING };
  return { average: Math.round(average * 10) / 10, count };
}

export function toPublicResidenceSummary(
  row: PublicResidenceRow,
  rating: PublicRating = NO_RATING,
): PublicResidenceSummary {
  const images = toPublicImages(row.images);
  return {
    id: row.id,
    title: row.title,
    typeResidence: row.typeResidence?.trim() || null,
    city: row.city,
    country: row.country,
    pricePerNight: { amount: row.pricePerDay, currency: PUBLIC_CURRENCY },
    capacity: row.capacity,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    nombrePieces: row.nombrePieces ?? null,
    coverImageUrl: images[0] ?? null,
    rating: { ...rating },
    url: residenceUrl(row.id),
  };
}

export function toPublicResidenceDetail(
  row: PublicResidenceRow,
  rating: PublicRating = NO_RATING,
): PublicResidenceDetail {
  return {
    ...toPublicResidenceSummary(row, rating),
    amenities: toPublicAmenities(row.amenities),
    images: toPublicImages(row.images),
  };
}
