import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { safeOwnerSelect } from '../common/prisma/safe-selects';
import { PaginationService, PaginationOptions, PaginationResult } from '../common/services/pagination.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { ResidencesService } from '../residences/residences.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { activeOfferWhere, nonDeletedOfferWhere, computeOfferStatus, OfferStatus } from './offer-filters';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private paginationService: PaginationService,
    private residencesService: ResidencesService,
    private vehiclesService: VehiclesService,
  ) {}

  async create(createOfferDto: CreateOfferDto, ownerId?: string) {
    const { residenceId, vehicleId } = createOfferDto;

    // Vérifier que la résidence existe
    const residence = await this.prisma.residence.findUnique({
      where: { id: residenceId },
      select: { id: true, ownerId: true, isActive: true },
    });

    if (!residence) {
      throw new NotFoundException('Résidence non trouvée');
    }

    if (!residence.isActive) {
      throw new BadRequestException('La résidence n\'est pas active');
    }

    if (!residence.ownerId) {
      throw new BadRequestException('La résidence doit avoir un propriétaire');
    }

    // Vérifier que le véhicule existe
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, ownerId: true, isActive: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Véhicule non trouvé');
    }

    if (!vehicle.isActive) {
      throw new BadRequestException('Le véhicule n\'est pas actif');
    }

    if (!vehicle.ownerId) {
      throw new BadRequestException('Le véhicule doit avoir un propriétaire');
    }

    // Vérifier que la résidence et le véhicule appartiennent au même propriétaire
    if (residence.ownerId !== vehicle.ownerId) {
      throw new BadRequestException(
        'Le véhicule et la résidence doivent appartenir au même propriétaire'
      );
    }

    // Si un ownerId est fourni (utilisateur non-admin), vérifier qu'il correspond au propriétaire de la résidence et du véhicule
    // Si ownerId n'est pas fourni (admin), on accepte et on utilisera le propriétaire de la résidence/véhicule
    if (ownerId && ownerId !== residence.ownerId) {
      throw new BadRequestException(
        'Vous ne pouvez créer une offre combinée qu\'avec vos propres résidences et véhicules'
      );
    }

    // Unicité : résidence/véhicule non utilisés dans une offre active ET non expirée
    const [offerWithResidence, offerWithVehicle] = await Promise.all([
      this.prisma.offer.findFirst({
        where: { residenceId, ...activeOfferWhere() },
        select: { id: true },
      }),
      this.prisma.offer.findFirst({
        where: { vehicleId, ...activeOfferWhere() },
        select: { id: true },
      }),
    ]);

    if (offerWithResidence) {
      throw new BadRequestException('Cette résidence est déjà utilisée dans une offre active');
    }
    if (offerWithVehicle) {
      throw new BadRequestException('Ce véhicule est déjà utilisé dans une offre active');
    }

    const data: any = { ...createOfferDto };
    
    // Assigner automatiquement le propriétaire (celui de la résidence/vehicule)
    data.ownerId = residence.ownerId;
    
    const created = await this.prisma.offer.create({
      data,
      include: {
        owner: {
          select: safeOwnerSelect,
        },
        residence: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        },
        vehicle: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
                bookings: true,
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return this.formatOfferResponse(created);
  }

  async findAll(options?: { proprietaireId?: string } & PaginationOptions): Promise<PaginationResult<any> | any[]> {
    const { proprietaireId, ...paginationOptions } = options || {};
    const { page, limit, sortBy, sortOrder } = this.paginationService.validatePaginationOptions(paginationOptions);
    
    // Scope public : actives ET non expirées
    const where: any = { ...activeOfferWhere() };

    if (proprietaireId) {
      where.ownerId = proprietaireId;
    }

    // Vérifier si la pagination est demandée (si limit est défini et différent de la valeur par défaut, ou page > 1)
    const isPaginationRequested = paginationOptions.page !== undefined || paginationOptions.limit !== undefined;
    
    const skip = isPaginationRequested ? this.paginationService.calculateSkip(page, limit) : undefined;
    const take = isPaginationRequested ? limit : undefined;

    const [offers, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        ...(skip !== undefined && { skip }),
        ...(take !== undefined && { take }),
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: safeOwnerSelect,
          },
          residence: {
            include: {
              reviews: {
                select: {
                  rating: true,
                },
              },
              _count: {
                select: {
                  reviews: true,
                },
              },
            },
          },
          vehicle: {
            include: {
              reviews: {
                select: {
                  rating: true,
                },
              },
              _count: {
                select: {
                  reviews: true,
                  bookings: true,
                },
              },
            },
          },
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      }),
      isPaginationRequested ? this.prisma.offer.count({ where }) : Promise.resolve(0),
    ]);

    const formattedOffers = offers.map(offer => this.formatOfferResponse(offer));

    // Si la pagination est demandée, retourner un objet paginé, sinon retourner simplement le tableau
    if (isPaginationRequested) {
      return {
        data: formattedOffers,
        pagination: this.paginationService.calculatePaginationMeta(page, limit, total),
      };
    }

    return formattedOffers;
  }

  async findOne(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        owner: {
          select: safeOwnerSelect,
        },
        residence: {
          include: {
            reviews: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        },
        vehicle: {
          include: {
            reviews: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            _count: {
              select: {
                reviews: true,
                bookings: true,
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Offre non trouvée');
    }

    return this.formatOfferResponse(offer);
  }

  /**
   * Version publique de findOne : lève une NotFoundException si l'offre est expirée
   * ou désactivée. Destinée aux endpoints publics ; les admins contournent via findOne().
   *
   * Règles :
   *   - statut: 'INACTIVE' → 404 "Offre non trouvée" (soft-deleted, ne pas révéler)
   *   - statut: 'EXPIREE'  → 404 "Cette offre a expiré"
   *   - statut: 'ACTIVE'   → retourne l'offre normalement
   *
   * Le statut est calculé par formatOfferResponse via computeOfferStatus(),
   * donc aucun appel DB supplémentaire n'est nécessaire.
   */
  async findOnePublic(id: string) {
    const offer = await this.findOne(id); // lève 404 si inexistante

    if (offer.statut === 'INACTIVE') {
      // Ne pas révéler l'existence d'une offre soft-deleted
      throw new NotFoundException('Offre non trouvée');
    }

    if (offer.statut === 'EXPIREE') {
      throw new NotFoundException('Cette offre a expiré');
    }

    return offer;
  }

  /**
   * Récupère toutes les plages de dates où l'offre combinée est réservée / occupée
   * (basé sur les réservations qui utilisent cette offre)
   */
  async getOccupiedDateRanges(offerId: string): Promise<{ start: string; end: string }[]> {
    console.log('🔥 OFFERS booked-dates offerId=', offerId);

    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true },
    });

    if (!offer) {
      throw new NotFoundException('Offre non trouvée');
    }

    // ── Source 1 : réservations directes sur cette offre
    const activeStatuses = [
      BookingStatus.AWAITING_PAYMENT,
      BookingStatus.PENDING,
      BookingStatus.PAID,
      BookingStatus.CONFIRMED,
      BookingStatus.ONGOING,
    ];

    const activeBookings = await this.prisma.booking.findMany({
      where: { offerId, status: { in: activeStatuses } },
      select: { id: true, startDate: true, endDate: true, status: true },
      orderBy: { startDate: 'asc' },
    });
    console.log(
      '🔥 OFFERS activeBookings count=', activeBookings.length,
      activeBookings.map((b) => ({ id: b.id, status: b.status, start: b.startDate, end: b.endDate })),
    );

    // ── Source 2 : blocked_dates liées aux bookings de cette offre
    // (blocked_dates n'a pas de colonne offerId — on passe par bookingId)
    const bookingIds = activeBookings.map((b) => b.id);

    const blockedDates = bookingIds.length > 0
      ? await this.prisma.blockedDate.findMany({
          where: { bookingId: { in: bookingIds } },
          select: { bookingId: true, startDate: true, endDate: true },
          orderBy: { startDate: 'asc' },
        })
      : [];
    console.log(
      '🔥 OFFERS blockedDates count=', blockedDates.length,
      JSON.stringify(blockedDates),
    );

    // ── Fusion sans doublon sur bookingId
    // Les blocked_dates de package ont les mêmes dates que leur booking —
    // on les intègre uniquement si leur bookingId n'est pas déjà couvert.
    const coveredByBooking = new Set(activeBookings.map((b) => b.id));

    const rangesFromBookings: { start: string; end: string }[] = activeBookings.map((b) => ({
      start: b.startDate.toISOString().split('T')[0],
      end: b.endDate.toISOString().split('T')[0],
    }));

    const grouped = new Map<string, { startDate: Date; endDate: Date }[]>();
    for (const bd of blockedDates) {
      if (bd.bookingId && coveredByBooking.has(bd.bookingId)) {
        continue;
      }
      const key = bd.bookingId ?? `manual_${bd.startDate.toISOString()}`;
      const group = grouped.get(key);
      if (group) {
        group.push({ startDate: bd.startDate, endDate: bd.endDate });
      } else {
        grouped.set(key, [{ startDate: bd.startDate, endDate: bd.endDate }]);
      }
    }

    const rangesFromBlocked = Array.from(grouped.values()).map((dates) => {
      const start = dates.reduce(
        (min, d) => (d.startDate < min ? d.startDate : min),
        dates[0].startDate,
      );
      const end = dates.reduce(
        (max, d) => (d.endDate > max ? d.endDate : max),
        dates[0].endDate,
      );
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    });

    const ranges = [...rangesFromBookings, ...rangesFromBlocked];
    console.log('🔥 OFFERS ranges computed=', ranges.length, JSON.stringify(ranges));
    return ranges;
  }

  /**
   * Formate une offre selon le format attendu par le frontend
   */
  private formatOfferResponse(offer: any) {
    // Formater la résidence
    const residence = this.formatResidenceForOffer(offer.residence);
    
    // Formater le véhicule
    const vehicle = this.formatVehicleForOffer(offer.vehicle);

    // 2. Calculer la note globale de l'Offre Combinée
    const reviews = offer.reviews || [];
    const count = reviews.length;
    const avg = count > 0 
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / count 
      : null;

    // Calcul du statut basé sur isActive + validTo
    const statut: OfferStatus = computeOfferStatus({
      isActive: offer.isActive,
      validTo: offer.validTo,
      validFrom: offer.validFrom,
    });

    return {
      id: offer.id,
      titre: offer.title,
      nbJours: offer.nbJours,
      prixPack: offer.price,
      remisePourcent: offer.discount || null,
      imageUrl: offer.imageUrl || residence.imageUrl || vehicle.imageUrl,
      residence,
      voiture: vehicle,
      isVerified: offer.isVerified || false,
      nombreReservations: offer._count?.bookings || 0,
      proprietaireId: offer.ownerId || (offer.owner ? offer.owner.id : null),
      proprietaire: offer.owner ? {
        id: offer.owner.id,
        nom: `${offer.owner.firstName} ${offer.owner.lastName}`,
        telephone: offer.owner.phone,
      } : null,
      statut,
      validFrom: offer.validFrom,
      validTo: offer.validTo,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }

  /**
   * Formate une résidence pour une offre
   */
  private formatResidenceForOffer(residence: any) {
    const notation = this.calculateNotation(residence.reviews || []);

    // Parser les images et commodités au cas où elles seraient stockées en JSON string
    const images = this.parseImages(residence.images);
    const amenities = this.parseAmenities(residence.amenities);

    return {
      id: residence.id,
      nom: residence.title,
      ville: residence.city,
      prixParNuit: residence.pricePerDay,
      imageUrl: images.length > 0 ? images[0] : null,
      capacite: residence.capacity,
      images,
      commodites: amenities,
      notation: {
        note: notation.note,
        avis: notation.avis,
      },
    };
  }

  /**
   * Formate un véhicule pour une offre
   */
  private formatVehicleForOffer(vehicle: any) {
    const notation = this.calculateNotation(vehicle.reviews || []);

    // Parser les images et options au cas où elles seraient stockées en JSON string
    const images = this.parseImages(vehicle.images);
    const features = this.parseAmenities(vehicle.features);

    return {
      id: vehicle.id,
      marque: vehicle.brand,
      modele: vehicle.model,
      prixParJour: vehicle.pricePerDay,
      imageUrl: images.length > 0 ? images[0] : null,
      places: vehicle.capacity,
      note: notation.note,
      avis: notation.avis,
      images,
      commodites: features,
      disponible: vehicle.isActive,
    };
  }

  /**
   * Parse les images depuis JSON string si nécessaire
   * (dupliqué ici pour éviter de dépendre de ResidenceService côté offres)
   */
  private parseImages(images: any): string[] {
    if (!images) return [];
    if (typeof images === 'string') {
      try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch {
        // Si ce n'est pas du JSON valide, traiter comme une seule image
        return images ? [images] : [];
      }
    }
    return Array.isArray(images) ? images : (images ? [images] : []);
  }

  /**
   * Parse les commodités / features depuis JSON string si nécessaire
   */
  private parseAmenities(amenities: any): string[] {
    if (!amenities) return [];
    if (typeof amenities === 'string') {
      try {
        const parsed = JSON.parse(amenities);
        return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch {
        return amenities ? [amenities] : [];
      }
    }
    return Array.isArray(amenities) ? amenities : (amenities ? [amenities] : []);
  }

  /**
   * Calcule la notation avec distribution des notes
   */
  private calculateNotation(reviews: any[]) {
    if (!reviews || reviews.length === 0) {
      return {
        note: 0,
        avis: 0,
      };
    }

    const total = reviews.length;
    const sum = reviews.reduce((acc, review) => acc + (review.rating || 0), 0);
    const average = sum / total;

    return {
      note: Math.round(average * 10) / 10, // Arrondir à 1 décimale
      avis: total,
    };
  }

  /**
   * Calcule le prix d'une offre avec remise selon la durée
   */
  calculatePriceWithDiscount(pricePerDay: number, numberOfDays: number, baseDiscount?: number): {
    prixOriginal: number;
    prixReduit: number;
    reduction: number;
    pourcentageReduction: number;
  } {
    const prixOriginal = pricePerDay * numberOfDays;
    
    // Utiliser la remise de base si fournie, sinon calculer selon la durée
    let pourcentageReduction = baseDiscount || 0;

    if (!baseDiscount) {
      if (numberOfDays >= 30) {
        pourcentageReduction = 20;
      } else if (numberOfDays >= 15) {
        pourcentageReduction = 15;
      } else if (numberOfDays >= 7) {
        pourcentageReduction = 10;
      } else if (numberOfDays >= 3) {
        pourcentageReduction = 5;
      }
    }

    const reduction = (prixOriginal * pourcentageReduction) / 100;
    const prixReduit = prixOriginal - reduction;

    return {
      prixOriginal,
      prixReduit,
      reduction,
      pourcentageReduction,
    };
  }

  async update(id: string, updateOfferDto: UpdateOfferDto) {
    const existingOffer = await this.prisma.offer.findUnique({
      where: { id },
      select: { residenceId: true, vehicleId: true },
    });

    if (!existingOffer) {
      throw new NotFoundException('Offre non trouvée');
    }

    // Si residenceId ou vehicleId sont modifiés, vérifier qu'ils appartiennent au même propriétaire
    const residenceId = updateOfferDto.residenceId || existingOffer.residenceId;
    const vehicleId = updateOfferDto.vehicleId || existingOffer.vehicleId;

    if (updateOfferDto.residenceId || updateOfferDto.vehicleId) {
      // Vérifier que la résidence existe
      const residence = await this.prisma.residence.findUnique({
        where: { id: residenceId },
        select: { id: true, ownerId: true, isActive: true },
      });

      if (!residence) {
        throw new NotFoundException('Résidence non trouvée');
      }

      if (!residence.isActive) {
        throw new BadRequestException('La résidence n\'est pas active');
      }

      if (!residence.ownerId) {
        throw new BadRequestException('La résidence doit avoir un propriétaire');
      }

      // Vérifier que le véhicule existe
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, ownerId: true, isActive: true },
      });

      if (!vehicle) {
        throw new NotFoundException('Véhicule non trouvé');
      }

      if (!vehicle.isActive) {
        throw new BadRequestException('Le véhicule n\'est pas actif');
      }

      if (!vehicle.ownerId) {
        throw new BadRequestException('Le véhicule doit avoir un propriétaire');
      }

      // Vérifier que la résidence et le véhicule appartiennent au même propriétaire
      if (residence.ownerId !== vehicle.ownerId) {
        throw new BadRequestException(
          'Le véhicule et la résidence doivent appartenir au même propriétaire'
        );
      }

      // Unicité : résidence/véhicule non utilisés dans une autre offre active et non expirée
      const [offerWithResidence, offerWithVehicle] = await Promise.all([
        updateOfferDto.residenceId
          ? this.prisma.offer.findFirst({
              where: { residenceId, ...activeOfferWhere(), NOT: { id } },
              select: { id: true },
            })
          : Promise.resolve(null),
        updateOfferDto.vehicleId
          ? this.prisma.offer.findFirst({
              where: { vehicleId, ...activeOfferWhere(), NOT: { id } },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

      if (offerWithResidence) {
        throw new BadRequestException('Cette résidence est déjà utilisée dans une offre active');
      }
      if (offerWithVehicle) {
        throw new BadRequestException('Ce véhicule est déjà utilisé dans une offre active');
      }
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: updateOfferDto,
      include: {
        owner: {
          select: safeOwnerSelect,
        },
        residence: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        },
        vehicle: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
                bookings: true,
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return this.formatOfferResponse(updated);
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.offer.update({
      where: { id },
      data: { isActive: false },
      include: {
        owner: {
          select: safeOwnerSelect,
        },
      },
    });
  }

  /**
   * Récupère les offres d'un propriétaire
   */
  async findByOwner(ownerId: string) {
    // Vue propriétaire : inclut les offres expirées (statut visible) mais pas les soft-deleted
    const offers = await this.prisma.offer.findMany({
      where: { ownerId, ...nonDeletedOfferWhere() },
      include: {
        owner: {
          select: safeOwnerSelect,
        },
        residence: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        },
        vehicle: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
                bookings: true,
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return offers.map(offer => this.formatOfferResponse(offer));
  }

  /**
   * Vérifie si un utilisateur est propriétaire d'une offre
   */
  async isOwner(offerId: string, userId: string): Promise<boolean> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { ownerId: true },
    });

    if (!offer) {
      return false;
    }

    return offer.ownerId === userId;
  }

  /**
   * Recherche des offres par titre, description, ville de la résidence, ou marque/modèle du véhicule
   */
  async search(query: string) {
    const offers = await this.prisma.offer.findMany({
      where: {
        AND: [
          // Scope public : actives ET non expirées
          activeOfferWhere(),
          {
            OR: [
              { title: { contains: query } },
              { description: { contains: query } },
              {
                residence: {
                  OR: [
                    { title: { contains: query } },
                    { city: { contains: query } },
                    { country: { contains: query } },
                  ],
                },
              },
              {
                vehicle: {
                  OR: [
                    { brand: { contains: query } },
                    { model: { contains: query } },
                  ],
                },
              },
            ],
          },
        ],
      },
      include: {
        owner: {
          select: safeOwnerSelect,
        },
        residence: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        },
        vehicle: {
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
                bookings: true,
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    // Formater les résultats selon le format attendu par le frontend
    return offers.map(offer => this.formatOfferResponse(offer));
  }
}
