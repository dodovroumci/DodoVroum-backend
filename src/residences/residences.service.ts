import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginationService, PaginationOptions, PaginationResult } from '../common/services/pagination.service';
import { CacheService } from '../cache/cache.service';
import { AppLoggerService } from '../logging/app-logger.service';
import { CreateResidenceDto } from './dto/create-residence.dto';
import { UpdateResidenceDto } from './dto/update-residence.dto';
import { BlockDateDto } from './dto/block-date.dto';

interface ResidencesQueryOptions extends PaginationOptions {
  type?: string;
  status?: 'available' | 'occupied';
  search?: string;
  proprietaireId?: string;
}

@Injectable()
export class ResidencesService {
  private readonly STORAGE_PATH = 'https://dodovroum.com/storage/residences';

  constructor(
    private prisma: PrismaService,
    private paginationService: PaginationService,
    private cacheService: CacheService,
    private logger: AppLoggerService,
  ) {}

  // --- PRIVATE UTILS ---

  private parseImages(images: any): string[] {
    const DEFAULT_IMAGE = 'default-residence.png';
    let raw: string[] = [];
    try {
      if (typeof images === 'string') {
        const trimmed = images.trim();
        raw = (trimmed.startsWith('[') || trimmed.startsWith('{')) ? JSON.parse(trimmed) : [trimmed];
      } else if (Array.isArray(images)) {
        raw = images;
      }
    } catch (e) { raw = []; }

    const processed = (Array.isArray(raw) ? raw : [])
      .filter(img => typeof img === 'string' && img.length > 0)
      .map(img => {
        if (img.startsWith('http')) return img;
        const fileName = img.split('/').pop() || img;
        return `${this.STORAGE_PATH}/${fileName}`;
      });
    return processed.length > 0 ? processed : [`${this.STORAGE_PATH}/${DEFAULT_IMAGE}`];
  }

  /**
   * @description Nettoie et mappe les données envoyées par Laravel (Index.vue) vers le Schéma Prisma
   */
  private transformResidenceDto(dto: any): any {
    const transformed: any = { ...dto };
    
    // Mapping strict pour éviter l'erreur "Unknown argument"
    const mapping: Record<string, string> = {
      nom: 'title', 
      adresse: 'address', 
      ville: 'city', 
      pays: 'country',
      prixParNuit: 'pricePerDay', 
      pricePerNight: 'pricePerDay',
      capacite: 'capacity', 
      nombreChambres: 'bedrooms',
      nombreSallesBain: 'bathrooms', 
      commodites: 'amenities',
      proprietaireId: 'ownerId' // C'est ici que ça bloquait dans tes logs
    };

    Object.keys(mapping).forEach(oldKey => {
      if (transformed[oldKey] !== undefined) {
        transformed[mapping[oldKey]] = transformed[oldKey];
        // SUPPRESSION CRITIQUE de l'ancien champ pour Prisma
        delete transformed[oldKey]; 
      }
    });

    // Gestion JSON pour Prisma
    if (Array.isArray(transformed.images)) transformed.images = JSON.stringify(transformed.images);
    if (Array.isArray(transformed.amenities)) transformed.amenities = JSON.stringify(transformed.amenities);

    return transformed;
  }

  // --- READ METHODS ---

  async findAll(options: ResidencesQueryOptions = {}): Promise<PaginationResult<any>> {
    const { type, search, proprietaireId, ...paginationOptions } = options;
    const { page, limit, sortBy, sortOrder } = this.paginationService.validatePaginationOptions(paginationOptions);

    const skip = this.paginationService.calculateSkip(page, limit);
    const where: any = { isActive: true };

    if (proprietaireId) where.ownerId = proprietaireId;
    if (type) where.typeResidence = { contains: type, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [residences, total] = await Promise.all([
      this.prisma.residence.findMany({ 
        where, 
        skip, 
        take: limit, 
        orderBy: { [sortBy]: sortOrder },
        include: { reviews: true } // ✅ On inclut les avis
      }),
      this.prisma.residence.count({ where }),
    ]);

    const data = await Promise.all(residences.map(async (res) => {
      const images = this.parseImages(res.images);
      const reviews = res.reviews || [];
      
      // ✅ Calcul de la moyenne pour Flutter
      const avg = reviews.length > 0 
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
        : null;

      return {
        ...res,
        nom: res.title,
        prixParNuit: res.pricePerDay,
        imageUrl: images[0],
        images: images,
        averageRating: avg ? parseFloat(avg.toFixed(1)) : null, // ✅ Clé lue par ton code Flutter
        reviewsCount: reviews.length,
        isAvailable: !(await this.isResidenceOccupied(res.id))
      };
    }));

    return { data, pagination: this.paginationService.calculatePaginationMeta(page, limit, total) };
  }

  async findOne(id: string) {
    const res = await this.prisma.residence.findUnique({
      where: { id },
      include: { owner: true, reviews: { include: { user: true } } }
    });
    if (!res) throw new NotFoundException('Résidence non trouvée');

    const images = this.parseImages(res.images);
    const reviews = res.reviews || [];
    const avg = reviews.length > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : null;

    return {
      ...res,
      nom: res.title,
      prixParNuit: res.pricePerDay,
      images: images,
      imageUrl: images[0],
      averageRating: avg ? parseFloat(avg.toFixed(1)) : null, // ✅ Note moyenne
      reviewsCount: reviews.length,
      proprietaire: res.owner ? { ...res.owner, nom: `${res.owner.firstName} ${res.owner.lastName}` } : null
    };
  }

  async findByOwner(ownerId: string, options: any = {}) {
    return this.findAll({ ...options, proprietaireId: ownerId });
  }

  async search(query: string, options: any = {}) {
    return this.findAll({ ...options, search: query });
  }

  // Cherche la fin de ton fichier ResidencesService et assure-toi d'avoir ceci :

  // --- AVAILABILITY & CALENDAR ---

  /**
   * @description Vérifie si la résidence est occupée AUJOURD'HUI
   */
  async isResidenceOccupied(residenceId: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Sécurité Timezone

    const [activeBooking, activeBlock] = await Promise.all([
      this.prisma.booking.findFirst({
        where: {
          residenceId,
          // On inclut les statuts qui signifient que le logement est pris
          status: { in: ['CONFIRMED', 'PENDING', 'CONFIRMEE'] }, 
          startDate: { lte: today }, 
          endDate: { gte: today }
        }
      }),
      this.prisma.blockedDate.findFirst({
        where: {
          residenceId,
          startDate: { lte: today }, 
          endDate: { gte: today }
        }
      })
    ]);
    return !!(activeBooking || activeBlock);
  }

  /**
   * @description Vérifie la disponibilité sur une plage donnée
   */
  async checkAvailability(id: string, startDate: Date, endDate: Date) {
    const res = await this.prisma.residence.findUnique({ where: { id } });
    if (!res) throw new NotFoundException('Résidence non trouvée');

    const bookingConflict = await this.prisma.booking.findFirst({
      where: {
        residenceId: id,
        status: { in: ['CONFIRMED', 'PENDING', 'CONFIRMEE'] },
        AND: [
          { startDate: { lt: endDate } },
          { endDate: { gt: startDate } }
        ]
      }
    });

    const blockConflict = await this.prisma.blockedDate.findFirst({
      where: {
        residenceId: id,
        AND: [
          { startDate: { lt: endDate } },
          { endDate: { gt: startDate } }
        ]
      }
    });

    const isAvailable = !bookingConflict && !blockConflict;
    const diff = Math.abs(endDate.getTime() - startDate.getTime());
    const nights = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));

    return {
      isAvailable,
      price: { prixOriginal: res.pricePerDay * nights },
      dates: { numberOfNights: nights }
    };
  }

  /**
   * @description Récupère TOUTES les dates bloquées (Format YYYY-MM-DD)
   * C'est ici qu'on ajoute la logique "Self-Healing" pour le calendrier
   */
  async getBookedDates(residenceId: string): Promise<string[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [bookings, blockedDates] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          residenceId,
          // ONGARDE UNILATERALE : On bloque tout ce qui n'est pas annulé
          // Si tu as un statut spécifique comme 'EN_COURS' ou 'COMPLETED', ajoute-le ici
          status: { in: ['CONFIRMED', 'PENDING', 'CONFIRMEE'] },
          endDate: { gte: today }
        },
        select: { startDate: true, endDate: true }
      }),
      this.prisma.blockedDate.findMany({
        where: { residenceId, endDate: { gte: today } },
        select: { startDate: true, endDate: true }
      })
    ]);

    const disabledDates = new Set<string>();
    
    const fillDates = (start: Date, end: Date) => {
      let current = new Date(start);
      current.setHours(0, 0, 0, 0);
      const last = new Date(end);
      last.setHours(0, 0, 0, 0);

      while (current <= last) {
        disabledDates.add(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    };

    bookings.forEach(b => fillDates(b.startDate, b.endDate));
    blockedDates.forEach(b => fillDates(b.startDate, b.endDate));

    return Array.from(disabledDates).sort();
  }

  // --- WRITE METHODS ---

  async create(dto: CreateResidenceDto, ownerIdFromAuth?: string) {
    try {
      // Transformation et nettoyage
      const data = this.transformResidenceDto(dto);
      
      const finalOwnerId = data.ownerId || ownerIdFromAuth;
      if (!finalOwnerId) throw new BadRequestException('ID propriétaire requis');
      data.ownerId = finalOwnerId;

      // Création Prisma garantie sans "proprietaireId"
      const res = await this.prisma.residence.create({ data });
      
      await this.cacheService.invalidateResidencesCache();
      return res;
    } catch (error) {
      this.logger.error(`Erreur création résidence: ${error.message}`);
      throw new InternalServerErrorException(`Création échouée: ${error.message}`);
    }
  }

  async update(id: string, dto: UpdateResidenceDto) {
    const data = this.transformResidenceDto(dto);
    const updated = await this.prisma.residence.update({ where: { id }, data });
    await this.cacheService.invalidateResidencesCache();
    return updated;
  }

  async remove(id: string) {
    return this.prisma.residence.update({ where: { id }, data: { isActive: false } });
  }

  async isOwner(residenceId: string, userId: string): Promise<boolean> {
    const res = await this.prisma.residence.findUnique({ where: { id: residenceId }, select: { ownerId: true } });
    return res?.ownerId === userId;
  }

  // --- BLOCKED DATES ---

  async blockDates(residenceId: string, dto: BlockDateDto) {
    return this.prisma.blockedDate.create({
      data: { residenceId, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), reason: dto.reason }
    });
  }

  async getBlockedDates(residenceId: string) {
    return this.prisma.blockedDate.findMany({ where: { residenceId }, orderBy: { startDate: 'asc' } });
  }

  async unblockDates(residenceId: string, blockedDateId: string) {
    return this.prisma.blockedDate.deleteMany({ where: { id: blockedDateId, residenceId } });
  }
}

