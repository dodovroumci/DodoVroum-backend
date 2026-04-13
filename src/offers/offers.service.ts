import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginationService, PaginationOptions, PaginationResult } from '../common/services/pagination.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { ResidencesService } from '../residences/residences.service';
import { VehiclesService } from '../vehicles/vehicles.service';

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

    const data: any = { ...createOfferDto };
    
    // Assigner automatiquement le propriétaire (celui de la résidence/vehicule)
    data.ownerId = residence.ownerId;
    
    const created = await this.prisma.offer.create({
      data,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
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
    
    const where: any = { isActive: true };
    
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
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
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
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
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
   * Récupère toutes les plages de dates où l'offre combinée est réservée / occupée
   * (basé sur les réservations qui utilisent cette offre)
   */
  async getOccupiedDateRanges(offerId: string) {
    // Vérifier que l'offre existe
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true },
    });

    if (!offer) {
      throw new NotFoundException('Offre non trouvée');
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        offerId,
        status: {
          in: [
            'PENDING',
            'CONFIRMED',
            'CONFIRMEE',
            'CHECKIN_CLIENT',
            'CHECKIN_PROPRIO',
            'EN_COURS_SEJOUR',
          ],
        },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return bookings.map((b) => ({
      id: b.id,
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
    }));
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
        email: offer.owner.email,
        nom: `${offer.owner.firstName} ${offer.owner.lastName}`,
        telephone: offer.owner.phone,
      } : null,
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
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: updateOfferDto,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
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
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Récupère les offres d'un propriétaire
   */
  async findByOwner(ownerId: string) {
    const offers = await this.prisma.offer.findMany({
      where: { ownerId, isActive: true },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
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
          { isActive: true },
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
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
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
