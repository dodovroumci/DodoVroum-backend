import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginationService, PaginationOptions, PaginationResult } from '../common/services/pagination.service';
import { CacheService } from '../cache/cache.service';
import { AppLoggerService } from '../logging/app-logger.service';
import { CreateResidenceDto } from './dto/create-residence.dto';
import { UpdateResidenceDto } from './dto/update-residence.dto';

interface ResidencesQueryOptions extends PaginationOptions {
  type?: string;
  status?: 'available' | 'occupied';
  search?: string;
  proprietaireId?: string;
}

@Injectable()
export class ResidencesService {
  constructor(
    private prisma: PrismaService,
    private paginationService: PaginationService,
    private cacheService: CacheService,
    private logger: AppLoggerService,
  ) {}

  /**
   * Transforme le DTO pour convertir pricePerNight en pricePerDay et location en latitude/longitude
   */
  private transformResidenceDto(dto: CreateResidenceDto | UpdateResidenceDto): any {
    const transformed: any = { ...dto };

    // Supprimer proprietaireId s'il est présent (ignoré car assigné automatiquement)
    if ('proprietaireId' in transformed) {
      delete transformed.proprietaireId;
    }

    // Convertir les propriétés françaises en anglaises
    // Title / Nom
    if ('nom' in transformed && transformed.nom !== undefined) {
      transformed.title = transformed.nom;
      delete transformed.nom;
    }
    // Address / Adresse
    if ('adresse' in transformed && transformed.adresse !== undefined) {
      transformed.address = transformed.adresse;
      delete transformed.adresse;
    }
    // City / Ville
    if ('ville' in transformed && transformed.ville !== undefined) {
      transformed.city = transformed.ville;
      delete transformed.ville;
    }
    // Country / Pays
    if ('pays' in transformed && transformed.pays !== undefined) {
      transformed.country = transformed.pays;
      delete transformed.pays;
    }
    // PricePerDay / PrixParNuit
    if ('prixParNuit' in transformed && transformed.prixParNuit !== undefined) {
      transformed.pricePerDay = transformed.prixParNuit;
      delete transformed.prixParNuit;
    }
    // Capacity / Capacite
    if ('capacite' in transformed && transformed.capacite !== undefined) {
      transformed.capacity = transformed.capacite;
      delete transformed.capacite;
    }
    // Bedrooms / NombreChambres
    if ('nombreChambres' in transformed && transformed.nombreChambres !== undefined) {
      transformed.bedrooms = transformed.nombreChambres;
      delete transformed.nombreChambres;
    }
    // Bathrooms / NombreSallesBain
    if ('nombreSallesBain' in transformed && transformed.nombreSallesBain !== undefined) {
      transformed.bathrooms = transformed.nombreSallesBain;
      delete transformed.nombreSallesBain;
    }
    // Amenities / Commodites
    if ('commodites' in transformed && transformed.commodites !== undefined) {
      transformed.amenities = transformed.commodites;
      delete transformed.commodites;
    }

    // Convertir pricePerNight en pricePerDay si présent
    if ('pricePerNight' in transformed && transformed.pricePerNight !== undefined) {
      transformed.pricePerDay = transformed.pricePerNight;
      delete transformed.pricePerNight;
    }

    // Convertir location en latitude/longitude si présent
    if ('location' in transformed && transformed.location) {
      transformed.latitude = transformed.location.latitude;
      transformed.longitude = transformed.location.longitude;
      delete transformed.location;
    }

    // Convertir images en JSON string si c'est un tableau
    if ('images' in transformed && Array.isArray(transformed.images)) {
      transformed.images = JSON.stringify(transformed.images);
    }

    // Convertir amenities en JSON string si c'est un tableau
    if ('amenities' in transformed && Array.isArray(transformed.amenities)) {
      transformed.amenities = JSON.stringify(transformed.amenities);
    }

    // Fournir une valeur par défaut pour description si elle est absente (requis par Prisma)
    if (!transformed.description || transformed.description === null || transformed.description === undefined) {
      transformed.description = transformed.title || 'Aucune description fournie';
    }

    return transformed;
  }

  async create(createResidenceDto: CreateResidenceDto, ownerId?: string) {
    const startTime = Date.now();
    
    try {
      const transformedData = this.transformResidenceDto(createResidenceDto);
      
      // Assigner automatiquement le propriétaire si fourni
      if (ownerId) {
        transformedData.ownerId = ownerId;
      }
      
      const residence = await this.prisma.residence.create({
        data: transformedData,
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

      // Invalider le cache des résidences
      await this.cacheService.invalidateResidencesCache();

      const duration = Date.now() - startTime;
      this.logger.logDatabaseQuery('CREATE', 'residence', duration, true);
      this.logger.logBusinessEvent('RESIDENCE_CREATED', 'residence', residence.id);

      return residence;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logDatabaseQuery('CREATE', 'residence', duration, false);
      this.logger.error('Failed to create residence', error.stack, 'RESIDENCE_SERVICE');
      throw error;
    }
  }

  /**
   * Vérifie si une résidence est occupée à une date donnée (ou aujourd'hui si non spécifiée)
   */
  private async isResidenceOccupied(residenceId: string, checkDate?: Date): Promise<boolean> {
    const dateToCheck = checkDate || new Date();
    
    const activeBooking = await this.prisma.booking.findFirst({
      where: {
        residenceId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { lte: dateToCheck },
        endDate: { gt: dateToCheck },
      },
    });

    return !!activeBooking;
  }

  /**
   * Récupère toutes les plages de dates où la résidence est réservée / occupée
   */
  async getOccupiedDateRanges(residenceId: string) {
    // Vérifier que la résidence existe
    const residence = await this.prisma.residence.findUnique({
      where: { id: residenceId },
      select: { id: true },
    });

    if (!residence) {
      throw new NotFoundException('Résidence non trouvée');
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        residenceId,
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

  async findAll(options: ResidencesQueryOptions = {}): Promise<PaginationResult<any>> {
    const { type, status, search, proprietaireId, ...paginationOptions } = options;
    const { page, limit, sortBy, sortOrder } = this.paginationService.validatePaginationOptions(paginationOptions);
    
    // Si un paramètre de recherche est fourni, utiliser la méthode search
    if (search) {
      return this.search(search, { page, limit, sortBy, sortOrder, type, status, proprietaireId });
    }
    
    // Essayer de récupérer depuis le cache (sans le filtre status et proprietaireId car ils dépendent des réservations/propriétaires)
    const cacheKey = { page, limit, sortBy, sortOrder, type };
    if (!status && !proprietaireId) {
      const cachedResult = await this.cacheService.getResidences(page, limit, cacheKey);
      if (cachedResult) {
        this.logger.debug('Residences retrieved from cache', 'CACHE');
        // Ajouter le statut de disponibilité même pour les résultats en cache
        const residencesWithStatus = await Promise.all(
          cachedResult.data.map(async (residence: any) => {
            const isOccupied = await this.isResidenceOccupied(residence.id);
            return {
              ...residence,
              isAvailable: !isOccupied,
              status: isOccupied ? 'occupied' : 'available',
            };
          }),
        );
        return {
          ...cachedResult,
          data: residencesWithStatus,
        };
      }
    }

    const startTime = Date.now();
    const skip = this.paginationService.calculateSkip(page, limit);

    const where: any = { isActive: true };
    if (type) {
      where.typeResidence = { contains: type };
    }
    if (proprietaireId) {
      where.ownerId = proprietaireId;
    }

    try {
      const [residences, total] = await Promise.all([
        this.prisma.residence.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          select: {
            id: true,
            title: true,
            description: true,
            address: true,
            city: true,
            country: true,
            pricePerDay: true,
            capacity: true,
            bedrooms: true,
            bathrooms: true,
            amenities: true,
            images: true,
            typeResidence: true,
            isVerified: true,
            latitude: true,
            longitude: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        }),
        this.prisma.residence.count({
          where,
        }),
      ]);

      // Calculer la note moyenne, vérifier la disponibilité et formater les données
      const residencesWithRating = await Promise.all(
        residences.map(async (residence) => {
          const reviews = await this.prisma.review.findMany({
            where: { residenceId: residence.id },
            select: { rating: true },
          });

          const notation = this.calculateNotation(reviews);
          const isOccupied = await this.isResidenceOccupied(residence.id);

          // Parser les images et amenities depuis JSON si nécessaire
          const images = this.parseImages(residence.images);
          const amenities = this.parseAmenities(residence.amenities);

          return {
            id: residence.id,
            nom: residence.title,
            ville: residence.city,
            adresse: residence.address,
            prixParNuit: residence.pricePerDay,
            capacite: residence.capacity,
            nombreChambres: residence.bedrooms,
            nombreSallesBain: residence.bathrooms,
            typeResidence: residence.typeResidence || 'Résidence',
            imageUrl: images.length > 0 ? images[0] : null,
            images: images,
            commodites: amenities,
            notation,
            isVerified: residence.isVerified || false,
            isAvailable: !isOccupied,
            status: isOccupied ? 'occupied' : 'available',
            localisation: residence.latitude && residence.longitude ? {
              latitude: residence.latitude,
              longitude: residence.longitude,
            } : null,
          };
        }),
      );

      // Filtrer par statut si demandé
      let filteredResidences = residencesWithRating;
      if (status === 'available') {
        filteredResidences = residencesWithRating.filter(r => r.isAvailable);
      } else if (status === 'occupied') {
        filteredResidences = residencesWithRating.filter(r => !r.isAvailable);
      }

      const result = {
        data: filteredResidences,
        pagination: this.paginationService.calculatePaginationMeta(
          page, 
          limit, 
          status ? filteredResidences.length : total
        ),
      };

      // Mettre en cache le résultat
      await this.cacheService.setResidences(page, limit, result, cacheKey, 300);

      const duration = Date.now() - startTime;
      this.logger.logDatabaseQuery('READ', 'residence', duration, true);
      this.logger.logPerformanceMetric('residences_query_duration', duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logDatabaseQuery('READ', 'residence', duration, false);
      this.logger.error('Failed to fetch residences', error.stack, 'RESIDENCE_SERVICE');
      throw error;
    }
  }

  async findOne(id: string) {
    const residence = await this.prisma.residence.findUnique({
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
    });

    if (!residence) {
      throw new NotFoundException('Résidence non trouvée');
    }

    // Calculer la notation
    const notation = this.calculateNotation(residence.reviews);

    // Vérifier si la résidence est occupée
    const isOccupied = await this.isResidenceOccupied(residence.id);

    // Parser les images et amenities depuis JSON si nécessaire
    const images = this.parseImages(residence.images);
    const amenities = this.parseAmenities(residence.amenities);

    // Formater les données selon le format attendu par le frontend
    const formattedResidence = {
      id: residence.id,
      nom: residence.title,
      ville: residence.city,
      adresse: residence.address,
      description: residence.description,
      prixParNuit: residence.pricePerDay,
      capacite: residence.capacity,
      nombreChambres: residence.bedrooms,
      nombreSallesBain: residence.bathrooms,
      typeResidence: residence.typeResidence || 'Résidence',
      imageUrl: images.length > 0 ? images[0] : null,
      images: images,
      commodites: amenities,
      notation,
      isVerified: residence.isVerified,
      isAvailable: !isOccupied,
      status: isOccupied ? 'occupied' : 'available',
      localisation: residence.latitude && residence.longitude ? {
        latitude: residence.latitude,
        longitude: residence.longitude,
      } : null,
      proprietaire: residence.owner ? {
        id: residence.owner.id,
        email: residence.owner.email,
        nom: `${residence.owner.firstName} ${residence.owner.lastName}`,
        telephone: residence.owner.phone,
      } : null,
      createdAt: residence.createdAt,
      updatedAt: residence.updatedAt,
    };

    return formattedResidence;
  }

  /**
   * Parse les images depuis JSON string si nécessaire
   */
  private parseImages(images: any): string[] {
    if (!images) return [];
    if (typeof images === 'string') {
      try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch (e) {
        // Si ce n'est pas du JSON valide, traiter comme une seule image
        return images ? [images] : [];
      }
    }
    return Array.isArray(images) ? images : (images ? [images] : []);
  }

  /**
   * Parse les amenities depuis JSON string si nécessaire
   */
  private parseAmenities(amenities: any): string[] {
    if (!amenities) return [];
    if (typeof amenities === 'string') {
      try {
        const parsed = JSON.parse(amenities);
        return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch (e) {
        // Si ce n'est pas du JSON valide, traiter comme une seule amenity
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
        distribution: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 },
      };
    }

    const total = reviews.length;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    const average = sum / total;

    // Distribution des notes
    const distribution = reviews.reduce((acc, review) => {
      const rating = review.rating.toString();
      acc[rating] = (acc[rating] || 0) + 1;
      return acc;
    }, { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 });

    return {
      note: Math.round(average * 10) / 10, // Arrondir à 1 décimale
      avis: total,
      distribution,
    };
  }

  /**
   * Calcule le prix avec réductions automatiques selon la durée
   */
  calculatePriceWithDiscount(pricePerDay: number, numberOfNights: number): {
    prixOriginal: number;
    prixReduit: number;
    reduction: number;
    pourcentageReduction: number;
  } {
    const prixOriginal = pricePerDay * numberOfNights;
    let pourcentageReduction = 0;

    if (numberOfNights >= 30) {
      pourcentageReduction = 20;
    } else if (numberOfNights >= 15) {
      pourcentageReduction = 15;
    } else if (numberOfNights >= 7) {
      pourcentageReduction = 10;
    } else if (numberOfNights >= 3) {
      pourcentageReduction = 5;
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

  /**
   * Vérifie la disponibilité et calcule le prix avec réductions
   */
  async checkAvailability(id: string, startDate: Date, endDate: Date) {
    // Récupérer la résidence avec le prix
    const residence = await this.prisma.residence.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        pricePerDay: true,
      },
    });
    
    if (!residence) {
      throw new NotFoundException('Résidence non trouvée');
    }

    // Vérifier les réservations existantes
    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        residenceId: id,
        status: { in: ['CONFIRMED', 'PENDING'] },
        OR: [
          {
            AND: [
              { startDate: { lte: startDate } },
              { endDate: { gte: startDate } },
            ],
          },
          {
            AND: [
              { startDate: { lte: endDate } },
              { endDate: { gte: endDate } },
            ],
          },
          {
            AND: [
              { startDate: { gte: startDate } },
              { endDate: { lte: endDate } },
            ],
          },
        ],
      },
    });

    const isAvailable = conflictingBookings.length === 0;

    // Calculer le nombre de nuits
    const numberOfNights = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Calculer le prix avec réductions
    const priceCalculation = this.calculatePriceWithDiscount(
      residence.pricePerDay,
      numberOfNights,
    );

    return {
      isAvailable,
      residence: {
        id: residence.id,
        nom: residence.title,
        prixParNuit: residence.pricePerDay,
      },
      dates: {
        startDate,
        endDate,
        numberOfNights,
      },
      price: priceCalculation,
    };
  }

  async update(id: string, updateResidenceDto: UpdateResidenceDto) {
    await this.findOne(id); // Vérifier que la résidence existe

    const transformedData = this.transformResidenceDto(updateResidenceDto);
    return this.prisma.residence.update({
      where: { id },
      data: transformedData,
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

  async remove(id: string) {
    await this.findOne(id); // Vérifier que la résidence existe

    return this.prisma.residence.update({
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
   * Récupère les résidences d'un propriétaire
   */
  async findByOwner(ownerId: string, options: ResidencesQueryOptions = {}): Promise<PaginationResult<any>> {
    const { type, status, ...paginationOptions } = options;
    const { page, limit, sortBy, sortOrder } = this.paginationService.validatePaginationOptions(paginationOptions);
    const skip = this.paginationService.calculateSkip(page, limit);

    const where: any = { ownerId, isActive: true };
    if (type) {
      where.typeResidence = { contains: type };
    }

    const [residences, total] = await Promise.all([
      this.prisma.residence.findMany({
        where,
        skip,
        take: limit,
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
          _count: {
            select: {
              reviews: true,
              bookings: true,
            },
          },
        },
      }),
      this.prisma.residence.count({
        where,
      }),
    ]);

    // Calculer la note moyenne et vérifier la disponibilité pour chaque résidence
    const residencesWithRating = await Promise.all(
      residences.map(async (residence) => {
        const reviews = await this.prisma.review.findMany({
          where: { residenceId: residence.id },
          select: { rating: true },
        });

        const notation = this.calculateNotation(reviews);
        const isOccupied = await this.isResidenceOccupied(residence.id);

        return {
          id: residence.id,
          nom: residence.title,
          ville: residence.city,
          adresse: residence.address,
          description: residence.description,
          prixParNuit: residence.pricePerDay,
          capacite: residence.capacity,
          nombreChambres: residence.bedrooms,
          nombreSallesBain: residence.bathrooms,
          typeResidence: residence.typeResidence || 'Résidence',
          imageUrl: (() => {
            const imgs = this.parseImages(residence.images);
            return imgs.length > 0 ? imgs[0] : null;
          })(),
          images: this.parseImages(residence.images),
          commodites: this.parseAmenities(residence.amenities),
          notation,
          isVerified: residence.isVerified || false,
          isAvailable: !isOccupied,
          status: isOccupied ? 'occupied' : 'available',
          localisation: residence.latitude && residence.longitude ? {
            latitude: residence.latitude,
            longitude: residence.longitude,
          } : null,
          proprietaire: residence.owner ? {
            id: residence.owner.id,
            email: residence.owner.email,
            nom: `${residence.owner.firstName} ${residence.owner.lastName}`,
            telephone: residence.owner.phone,
          } : null,
          nombreReservations: residence._count.bookings,
          nombreAvis: residence._count.reviews,
          createdAt: residence.createdAt,
          updatedAt: residence.updatedAt,
        };
      }),
    );

    // Filtrer par statut si demandé
    let filteredResidences = residencesWithRating;
    if (status === 'available') {
      filteredResidences = residencesWithRating.filter(r => r.isAvailable);
    } else if (status === 'occupied') {
      filteredResidences = residencesWithRating.filter(r => !r.isAvailable);
    }

    return {
      data: filteredResidences,
      pagination: this.paginationService.calculatePaginationMeta(
        page, 
        limit, 
        status ? filteredResidences.length : total
      ),
    };
  }

  /**
   * Vérifie si un utilisateur est propriétaire d'une résidence
   */
  async isOwner(residenceId: string, userId: string): Promise<boolean> {
    const residence = await this.prisma.residence.findUnique({
      where: { id: residenceId },
      select: { ownerId: true },
    });

    if (!residence) {
      return false;
    }

    return residence.ownerId === userId;
  }

  async search(
    query: string, 
    options: { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; type?: string; status?: 'available' | 'occupied'; proprietaireId?: string } = {}
  ): Promise<PaginationResult<any>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', type, status, proprietaireId } = options;
    const skip = this.paginationService.calculateSkip(page, limit);

    const where: any = {
      AND: [
        { isActive: true },
        {
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
            { city: { contains: query } },
            { country: { contains: query } },
            { address: { contains: query } },
            { typeResidence: { contains: query } },
          ],
        },
      ],
    };

    if (type) {
      where.AND.push({ typeResidence: { contains: type } });
    }

    if (proprietaireId) {
      where.AND.push({ ownerId: proprietaireId });
    }

    const [residences, total] = await Promise.all([
      this.prisma.residence.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          title: true,
          description: true,
          address: true,
          city: true,
          country: true,
          pricePerDay: true,
          capacity: true,
          bedrooms: true,
          bathrooms: true,
          amenities: true,
          images: true,
          typeResidence: true,
          isVerified: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              reviews: true,
            },
          },
        },
      }),
      this.prisma.residence.count({ where }),
    ]);

    // Calculer la note moyenne, vérifier la disponibilité et formater les données
    const residencesWithRating = await Promise.all(
      residences.map(async (residence) => {
        const reviews = await this.prisma.review.findMany({
          where: { residenceId: residence.id },
          select: { rating: true },
        });

        const notation = this.calculateNotation(reviews);
        const isOccupied = await this.isResidenceOccupied(residence.id);

        return {
          id: residence.id,
          nom: residence.title,
          ville: residence.city,
          adresse: residence.address,
          description: residence.description,
          prixParNuit: residence.pricePerDay,
          capacite: residence.capacity,
          nombreChambres: residence.bedrooms,
          nombreSallesBain: residence.bathrooms,
          typeResidence: residence.typeResidence || 'Résidence',
          imageUrl: (() => {
            const imgs = this.parseImages(residence.images);
            return imgs.length > 0 ? imgs[0] : null;
          })(),
          images: this.parseImages(residence.images),
          commodites: this.parseAmenities(residence.amenities),
          notation,
          isVerified: residence.isVerified || false,
          isAvailable: !isOccupied,
          status: isOccupied ? 'occupied' : 'available',
          localisation: residence.latitude && residence.longitude ? {
            latitude: residence.latitude,
            longitude: residence.longitude,
          } : null,
        };
      }),
    );

    // Filtrer par statut si demandé
    let filteredResidences = residencesWithRating;
    if (status === 'available') {
      filteredResidences = residencesWithRating.filter(r => r.isAvailable);
    } else if (status === 'occupied') {
      filteredResidences = residencesWithRating.filter(r => !r.isAvailable);
    }

    return {
      data: filteredResidences,
      pagination: this.paginationService.calculatePaginationMeta(
        page,
        limit,
        status ? filteredResidences.length : total,
      ),
    };
  }
}
