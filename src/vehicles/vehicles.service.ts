import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { safeOwnerSelect } from '../common/prisma/safe-selects';
import { VehiclesQueryDto } from './dto/vehicles-query.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VehicleType, Prisma, BookingStatus } from '@prisma/client';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- RESTAURÉ : UTILISÉ PAR LES GUARDS ET CONTROLLERS ---

  async isOwner(vehicleId: string, userId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { ownerId: true }
    });
    return vehicle?.ownerId === userId;
  }

  async findAllTypes() {
    return [
      { id: 'citadine', label: 'Citadine', icon: '🚗' },
      { id: 'berline', label: 'Berline', icon: '🚘' },
      { id: 'suv', label: 'SUV', icon: '🚙' },
      { id: 'utilitaire', label: 'Utilitaire', icon: '🚚' },
      { id: 'luxe', label: 'Luxe', icon: '🏎️' },
    ];
  }

  async getVehicleTypes() {
    return this.findAllTypes();
  }

  // --- MAPPING & NORMALISATION ---

  private transformVehicleData(data: any): any {
    const transformed = { ...data };
    const mapping: Record<string, string> = {
      proprietaireId: 'ownerId',
      prixParJour: 'pricePerDay',
      immatriculation: 'licensePlate',
      places: 'seats',
      carburant: 'fuelType',
      boite: 'transmission'
    };

    Object.keys(mapping).forEach(oldKey => {
      if (transformed[oldKey] !== undefined) {
        transformed[mapping[oldKey]] = transformed[oldKey];
        delete transformed[oldKey];
      }
    });

    return transformed;
  }

  private normalizeVehicleType(type: any): VehicleType {
    const t = String(type).toUpperCase();
    const mapping: Record<string, VehicleType> = {
      'BERLINE': VehicleType.CAR, 'CAR': VehicleType.CAR, 'CITADINE': VehicleType.CAR,
      'SUV': VehicleType.SUV, '4X4': VehicleType.SUV, 'MOTO': VehicleType.MOTORCYCLE,
      'MOTORCYCLE': VehicleType.MOTORCYCLE, 'VAN': VehicleType.VAN, 'UTILITAIRE': VehicleType.TRUCK, 'TRUCK': VehicleType.TRUCK
    };
    return mapping[t] || VehicleType.CAR;
  }

  // --- WRITE METHODS ---

  async create(dto: CreateVehicleDto, ownerId: string) {
    // Exclure ownerId et proprietaireId pour éviter tout conflit avec la relation Prisma
    const { ownerId: _o, proprietaireId: _p, ...dtoWithoutOwner } = dto as any;
    const cleanData = this.transformVehicleData(dtoWithoutOwner);

    try {
      const vehicle = await this.prisma.vehicle.create({
        data: {
          brand: cleanData.brand,
          model: cleanData.model,
          title: cleanData.title || null,
          description: cleanData.description || null,
          type: this.normalizeVehicleType(cleanData.type),
          pricePerDay: parseFloat((cleanData.pricePerDay || 0).toString()),
          plateNumber: cleanData.licensePlate || cleanData.plateNumber || 'NON-RENSEIGNE',
          year: parseInt((cleanData.year || new Date().getFullYear()).toString()),
          capacity: parseInt((cleanData.seats || cleanData.capacity || "5").toString()),
          isActive: true,
          fuelType: cleanData.fuelType || cleanData.fuel || "Essence",
          transmission: cleanData.transmission || "Manuelle",
          color: cleanData.color || null,
          mileage: cleanData.mileage ? parseInt(cleanData.mileage.toString()) : null,
          features: JSON.stringify(cleanData.features || []),
          images: JSON.stringify(cleanData.images || []),
          owner: { connect: { id: String(ownerId) } },
        },
      });
      return this.enrichVehicleResponse(vehicle);
    } catch (error) {
      this.logger.error(`[CREATE_ERROR] ${error.message}`);
      throw new InternalServerErrorException("Erreur lors de la création.");
    }
  }

  async update(id: string, data: any, user: any) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException("Véhicule introuvable.");

    const isAdmin = user.role?.toLowerCase() === 'admin' || user.role === 'ADMIN';
    if (!isAdmin && vehicle.ownerId !== user.id) throw new ForbiddenException("Accès refusé.");

    const cleanData = this.transformVehicleData(data);
    const updateData: any = {};
    
    const directFields = ['brand', 'model', 'description', 'color', 'transmission', 'title'];
    directFields.forEach(f => { if (cleanData[f] !== undefined) updateData[f] = cleanData[f]; });

    if (cleanData.fuelType) updateData.fuelType = cleanData.fuelType;
    if (cleanData.licensePlate || cleanData.plateNumber) updateData.plateNumber = cleanData.licensePlate || cleanData.plateNumber;
    if (cleanData.pricePerDay !== undefined) updateData.pricePerDay = parseFloat(cleanData.pricePerDay.toString());
    if (cleanData.year !== undefined) updateData.year = parseInt(cleanData.year.toString());
    if (cleanData.seats || cleanData.capacity) updateData.capacity = parseInt((cleanData.seats || cleanData.capacity).toString());
    if (cleanData.mileage !== undefined) updateData.mileage = cleanData.mileage ? parseInt(cleanData.mileage.toString()) : null;
    if (cleanData.isActive !== undefined) updateData.isActive = (String(cleanData.isActive) === 'true' || cleanData.isActive === true);
    if (cleanData.features) updateData.features = JSON.stringify(cleanData.features);
    if (cleanData.images) updateData.images = JSON.stringify(cleanData.images);
    if (cleanData.type) updateData.type = this.normalizeVehicleType(cleanData.type);

    try {
      const updated = await this.prisma.vehicle.update({ where: { id }, data: updateData });
      return this.enrichVehicleResponse(updated);
    } catch (error) {
      throw new BadRequestException("Échec de la mise à jour.");
    }
  }

  // --- READ METHODS ---

  private enrichVehicleResponse(vehicle: any) {
    const hasCustomTitle = vehicle.title && vehicle.title.trim() !== '';
    const displayTitle = hasCustomTitle ? vehicle.title : `${vehicle.brand} ${vehicle.model}`.trim();

    let images = [];
    try {
      images = typeof vehicle.images === 'string' ? JSON.parse(vehicle.images) : (vehicle.images || []);
    } catch (e) { images = []; }

    // ✅ Calcul de la note moyenne pour Flutter
    const reviews = vehicle.reviews || [];
    const avg = reviews.length > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : null;

    return {
      ...vehicle,
      title: displayTitle,
      name: displayTitle,
      images: Array.isArray(images) ? images : [],
      // ✅ Nouvelles clés pour l'UI
      averageRating: avg ? parseFloat(avg.toFixed(1)) : null,
      reviewsCount: reviews.length
    };
  }

  

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { owner: { select: safeOwnerSelect } },
    });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');
    return vehicle;
  }

  async findAll(query: any, ownerId?: string) {
    const { search, type, brand, isActive } = query;
    const where: any = {};

    // 1. Logique Dashboard : si un ID est fourni, on restreint a son proprietaire
    if (ownerId) {
      where.ownerId = ownerId;
    }
    // 2. Logique Mobile : si pas d'ID, on expose les vehicules actifs (ou inactifs si isActive=false)
    else {
      where.isActive = isActive !== undefined ? isActive : true;
    }

    // 3. Filtres optionnels
    if (type) where.type = type;
    if (brand) where.brand = { contains: brand };

    // 4. Recherche textuelle
    if (search) {
      where.OR = [
        { brand: { contains: search } },
        { model: { contains: search } },
        { plateNumber: { contains: search } },
      ];
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where,
      include: {
        owner: { select: safeOwnerSelect },
        reviews: { select: { id: true, rating: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles.map(v => this.enrichVehicleResponse(v));
  }

  async search(query: VehiclesQueryDto | string) {
    if (typeof query === 'string') return this.findAll({ search: query });
    return this.findAll(query);
  }

  async getVehicleBookedRanges(vehicleId: string): Promise<{ start: string; end: string }[]> {
    // ── Source 1 : réservations simples (booking.vehicleId = param)
    // Les bookings simples n'écrivent PAS dans blocked_dates → source obligatoire.
    const activeStatuses = [
      BookingStatus.AWAITING_PAYMENT,
      BookingStatus.PENDING,
      BookingStatus.PAID,
      BookingStatus.CONFIRMED,
      BookingStatus.ONGOING,
    ];

    const activeBookings = await this.prisma.booking.findMany({
      where: { vehicleId, status: { in: activeStatuses } },
      select: { id: true, startDate: true, endDate: true },
    });

    // ── Source 2 : blocked_dates (réservations package + blocs manuels)
    // Pour les packages, booking.vehicleId peut être null ; seule blocked_dates a vehicleId.
    const blockedDates = await this.prisma.blockedDate.findMany({
      where: { vehicleId },
      select: { bookingId: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });

    // ── Fusion des deux sources sans doublon sur bookingId
    const coveredByBooking = new Set(activeBookings.map((b) => b.id));

    const rangesFromBookings: { start: string; end: string }[] = activeBookings.map((b) => ({
      start: b.startDate.toISOString().split('T')[0],
      end: b.endDate.toISOString().split('T')[0],
    }));

    // Grouper les blocked_dates non déjà couvertes par activeBookings
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
    return ranges;
  }

  async remove(id: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');

    const bookingCount = await this.prisma.booking.count({
      where: { vehicleId: id },
    });

    if (bookingCount > 0) {
      throw new ForbiddenException(
        `Ce véhicule ne peut être supprimé car il est lié à ${bookingCount} réservation(s).`,
      );
    }

    await this.prisma.vehicle.delete({ where: { id } });
  }
}
