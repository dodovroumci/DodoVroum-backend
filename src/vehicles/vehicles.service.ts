import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { VehiclesQueryDto } from './dto/vehicles-query.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VehicleType, Prisma } from '@prisma/client';

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

  async create(dto: CreateVehicleDto, user: any) {
    const cleanData = this.transformVehicleData(dto);
    const targetOwnerId = (user.role?.toLowerCase() === 'admin' && cleanData.ownerId) 
      ? cleanData.ownerId 
      : user.id;

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
          owner: { connect: { id: String(targetOwnerId) } }
        }
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

  

    async findAll(query: VehiclesQueryDto) {
    const { proprietaireId, type, search } = query;
    const andFilters: Prisma.VehicleWhereInput[] = [];

    if (proprietaireId) andFilters.push({ ownerId: proprietaireId });
    if (type) andFilters.push({ type: this.normalizeVehicleType(type) });

    if (search) {
      andFilters.push({
        OR: [
          { brand: { contains: search } },
          { model: { contains: search } },
          { title: { contains: search } },
        ],
      });
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: andFilters.length > 0 ? { AND: andFilters } : {},
      include: { 
        owner: { select: { id: true, firstName: true, avatar: true } },
        reviews: true // ✅ Crucial pour le calcul de la note
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles.map(v => this.enrichVehicleResponse(v));
  }

  async search(query: VehiclesQueryDto | string) {
    if (typeof query === 'string') return this.findAll({ search: query });
    return this.findAll(query);
  }

  async remove(id: string) {
    return await this.prisma.vehicle.delete({ where: { id } });
  }
}
