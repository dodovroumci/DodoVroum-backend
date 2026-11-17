import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildDateOverlapCondition } from '../common/utils/date-overlap.util';
import {
  buildBlockingBookingWhere,
  residenceBookingScope,
} from '../bookings/booking-blocking.rule';
import {
  PARTNER_DEFAULT_LIMIT,
  PartnerResidencesQueryDto,
  PartnerResidenceSort,
} from './dto/partner-api-query.dto';
import { invalidParameter, residenceNotFound } from './partner-api.errors';
import {
  ELIGIBLE_RESIDENCE_WHERE,
  NO_RATING,
  PUBLIC_CURRENCY,
  PUBLIC_RESIDENCE_SELECT,
  PublicRating,
  PublicResidenceDetail,
  PublicResidenceSummary,
  residenceUrl,
  toPublicRating,
  toPublicResidenceDetail,
  toPublicResidenceSummary,
} from './public-residence.serializer';
import { parseStay, Stay } from './stay-dates';

/** Identifiant accepté dans l'URL (cuid et formes historiques) ; autre → 404 sans requête. */
const RESIDENCE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const SORT_ORDER: Record<
  PartnerResidenceSort,
  Prisma.ResidenceOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ pricePerDay: 'asc' }, { id: 'asc' }],
  price_desc: [{ pricePerDay: 'desc' }, { id: 'asc' }],
};

export interface PublicPage<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PublicAvailability {
  residenceId: string;
  checkIn: string;
  checkOut: string;
  available: boolean;
  nights: number;
  pricePerNight: { amount: number; currency: string };
  estimatedTotal: { amount: number; currency: string };
  url: string;
}

/**
 * Lectures des API publique et partenaire. Toutes les requêtes partent de
 * ELIGIBLE_RESIDENCE_WHERE et de PUBLIC_RESIDENCE_SELECT : aucune n'écrit en base,
 * aucune ne lit une colonne hors de la liste blanche.
 */
@Injectable()
export class PublicResidencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getResidence(id: string): Promise<PublicResidenceDetail> {
    if (!RESIDENCE_ID.test(id)) throw residenceNotFound();

    const row = await this.prisma.residence.findFirst({
      where: { id, ...ELIGIBLE_RESIDENCE_WHERE },
      select: PUBLIC_RESIDENCE_SELECT,
    });
    if (!row) throw residenceNotFound();

    const ratings = await this.ratingsFor([row.id]);
    return toPublicResidenceDetail(row, ratings.get(row.id));
  }

  async searchResidences(
    query: PartnerResidencesQueryDto,
    now: Date = new Date(),
  ): Promise<PublicPage<PublicResidenceSummary>> {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw invalidParameter(
        'minPrice doit être inférieur ou égal à maxPrice.',
      );
    }
    if ((query.checkIn === undefined) !== (query.checkOut === undefined)) {
      throw invalidParameter(
        'checkIn et checkOut doivent être fournis ensemble.',
      );
    }
    const stay =
      query.checkIn !== undefined
        ? parseStay(query.checkIn, query.checkOut!, now)
        : null;

    const page = query.page ?? 1;
    const limit = query.limit ?? PARTNER_DEFAULT_LIMIT;
    const where = this.buildSearchWhere(query, stay, now);

    const [total, rows] = await Promise.all([
      this.prisma.residence.count({ where }),
      this.prisma.residence.findMany({
        where,
        select: PUBLIC_RESIDENCE_SELECT,
        orderBy: SORT_ORDER[query.sort ?? 'newest'],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const ratings = await this.ratingsFor(rows.map((row) => row.id));
    return {
      data: rows.map((row) =>
        toPublicResidenceSummary(row, ratings.get(row.id)),
      ),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAvailability(
    id: string,
    checkIn: string,
    checkOut: string,
    now: Date = new Date(),
  ): Promise<PublicAvailability> {
    if (!RESIDENCE_ID.test(id)) throw residenceNotFound();
    const stay = parseStay(checkIn, checkOut, now);

    const residence = await this.prisma.residence.findFirst({
      where: { id, ...ELIGIBLE_RESIDENCE_WHERE },
      select: { id: true, pricePerDay: true },
    });
    if (!residence) throw residenceNotFound();

    // Même contrôle que BookingValidationService.validateResidenceAvailability :
    // réservations directes ou via une offre, puis blocages manuels.
    const [booking, blocked] = await Promise.all([
      this.prisma.booking.findFirst({
        where: {
          ...residenceBookingScope(residence.id),
          ...buildBlockingBookingWhere(stay.start, stay.end, now),
        },
        select: { id: true },
      }),
      this.prisma.blockedDate.findFirst({
        where: {
          residenceId: residence.id,
          ...buildDateOverlapCondition(stay.start, stay.end),
        },
        select: { id: true },
      }),
    ]);

    // Même calcul que BookingValidationService.calculateTotalPrice (nuits ≥ 1 garanti par parseStay).
    return {
      residenceId: residence.id,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      available: !booking && !blocked,
      nights: stay.nights,
      pricePerNight: {
        amount: residence.pricePerDay,
        currency: PUBLIC_CURRENCY,
      },
      estimatedTotal: {
        amount: residence.pricePerDay * stay.nights,
        currency: PUBLIC_CURRENCY,
      },
      url: residenceUrl(residence.id),
    };
  }

  private buildSearchWhere(
    query: PartnerResidencesQueryDto,
    stay: Stay | null,
    now: Date,
  ): Prisma.ResidenceWhereInput {
    const and: Prisma.ResidenceWhereInput[] = [ELIGIBLE_RESIDENCE_WHERE];

    if (query.city) and.push({ city: query.city });
    if (query.q)
      and.push({
        OR: [{ title: { contains: query.q } }, { city: { contains: query.q } }],
      });
    if (query.typeResidence)
      and.push({ typeResidence: { contains: query.typeResidence } });
    if (query.minPrice !== undefined)
      and.push({ pricePerDay: { gte: query.minPrice } });
    if (query.maxPrice !== undefined)
      and.push({ pricePerDay: { lte: query.maxPrice } });
    if (query.guests !== undefined)
      and.push({ capacity: { gte: query.guests } });
    if (query.bedrooms !== undefined)
      and.push({ bedrooms: { gte: query.bedrooms } });

    if (stay) {
      // Règle de getAvailability exprimée en filtres de relation. L'extension soft-delete
      // ne s'applique pas aux relations : deletedAt: null est ajouté explicitement.
      const blocking: Prisma.BookingWhereInput = {
        deletedAt: null,
        ...buildBlockingBookingWhere(stay.start, stay.end, now),
      };
      and.push({
        bookings: { none: blocking },
        offers: { none: { bookings: { some: blocking } } },
        blockedDates: { none: buildDateOverlapCondition(stay.start, stay.end) },
      });
    }

    return { AND: and };
  }

  /** Moyenne et nombre d'avis, en une requête groupée (aucun texte ni auteur lu). */
  private async ratingsFor(ids: string[]): Promise<Map<string, PublicRating>> {
    const ratings = new Map<string, PublicRating>();
    if (ids.length === 0) return ratings;

    const groups = await this.prisma.review.groupBy({
      by: ['residenceId'],
      where: { residenceId: { in: ids } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const group of groups) {
      if (group.residenceId)
        ratings.set(
          group.residenceId,
          toPublicRating(group._avg.rating, group._count._all),
        );
    }
    for (const id of ids)
      if (!ratings.has(id)) ratings.set(id, { ...NO_RATING });
    return ratings;
  }
}
