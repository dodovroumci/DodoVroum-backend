import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleType } from '@prisma/client';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Transforme le DTO pour convertir les propriétés alternatives
   */
  private transformVehicleDto(dto: CreateVehicleDto | UpdateVehicleDto): any {
    const transformed: any = { ...dto };

    // Supprimer proprietaireId s'il est présent (ignoré car assigné automatiquement)
    if ('proprietaireId' in transformed) {
      delete transformed.proprietaireId;
    }

    // Convertir name en title si présent
    if ('name' in transformed && transformed.name !== undefined) {
      transformed.title = transformed.title || transformed.name;
      delete transformed.name;
    }

    // Convertir seats en capacity si présent
    if ('seats' in transformed && transformed.seats !== undefined) {
      transformed.capacity = transformed.capacity || transformed.seats;
      delete transformed.seats;
    }

    // Convertir fuel en fuelType si présent
    if ('fuel' in transformed && transformed.fuel !== undefined) {
      transformed.fuelType = transformed.fuelType || transformed.fuel;
      delete transformed.fuel;
    }

    // Normaliser le type si c'est une string (convertir en majuscules et mapper)
    if ('type' in transformed && transformed.type) {
      if (typeof transformed.type === 'string') {
        const upperType = transformed.type.toUpperCase();
        // Mapper les valeurs courantes
        const typeMap: Record<string, VehicleType> = {
          'CAR': VehicleType.CAR,
          'VOITURE': VehicleType.CAR,
          'SUV': VehicleType.SUV,
          'MOTORCYCLE': VehicleType.MOTORCYCLE,
          'MOTO': VehicleType.MOTORCYCLE,
          'BICYCLE': VehicleType.BICYCLE,
          'VELO': VehicleType.BICYCLE,
          'SCOOTER': VehicleType.SCOOTER,
          'VAN': VehicleType.VAN,
          'TRUCK': VehicleType.TRUCK,
          'CAMION': VehicleType.TRUCK,
        };
        const mappedValue = typeMap[upperType];
        if (mappedValue) {
          transformed.type = mappedValue;
        } else if (Object.values(VehicleType).includes(upperType as VehicleType)) {
          transformed.type = upperType as VehicleType;
        } else {
          // Si le type n'est pas reconnu, supprimer le champ pour éviter une erreur Prisma
          delete transformed.type;
        }
      } else if (!Object.values(VehicleType).includes(transformed.type as VehicleType)) {
        // Si ce n'est pas une string et pas un enum valide, supprimer
        delete transformed.type;
      }
    }

    // Ignorer description (non stocké en base)
    delete transformed.description;

    // Convertir images en JSON string si c'est un tableau
    if ('images' in transformed && Array.isArray(transformed.images)) {
      transformed.images = JSON.stringify(transformed.images);
    }

    // Convertir features en JSON string si c'est un tableau
    if ('features' in transformed && Array.isArray(transformed.features)) {
      transformed.features = JSON.stringify(transformed.features);
    }

    return transformed;
  }

  async create(createVehicleDto: CreateVehicleDto, ownerId?: string) {
    const transformedData = this.transformVehicleDto(createVehicleDto);
    
    // Assigner automatiquement le propriétaire si fourni
    if (ownerId) {
      transformedData.ownerId = ownerId;
    }
    
    // Si le type n'est pas fourni, utiliser CAR par défaut
    if (!transformedData.type) {
      transformedData.type = VehicleType.CAR;
    }
    
    const created = await this.prisma.vehicle.create({
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
        reviews: {
          select: {
            rating: true,
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return this.formatVehicleResponse(created);
  }

  async findAll() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { isActive: true },
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
    });

    // Formater les données selon le format attendu par le frontend
    return vehicles.map(vehicle => this.formatVehicleResponse(vehicle));
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
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
    });

    if (!vehicle) {
      throw new NotFoundException('Véhicule non trouvé');
    }

    return this.formatVehicleResponse(vehicle);
  }

  /**
   * Récupère toutes les plages de dates où le véhicule est réservé / occupé
   */
  async getOccupiedDateRanges(vehicleId: string) {
    // Vérifier que le véhicule existe
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Véhicule non trouvé');
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        vehicleId,
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
   * Formate un véhicule selon le format attendu par le frontend
   */
  private formatVehicleResponse(vehicle: any) {
    // Calculer la notation
    const notation = this.calculateNotation(vehicle.reviews || []);

    // Parser les images depuis JSON string si nécessaire
    let images = vehicle.images;
    if (typeof images === 'string') {
      try {
        images = JSON.parse(images);
      } catch (e) {
        // Si ce n'est pas du JSON valide, traiter comme une seule image
        images = images ? [images] : [];
      }
    } else if (!Array.isArray(images)) {
      images = images ? [images] : [];
    }

    // Parser les features depuis JSON string si nécessaire
    let features = vehicle.features;
    if (typeof features === 'string') {
      try {
        features = JSON.parse(features);
      } catch (e) {
        // Si ce n'est pas du JSON valide, traiter comme une seule feature
        features = features ? [features] : [];
      }
    } else if (!Array.isArray(features)) {
      features = features ? [features] : [];
    }

    return {
      id: vehicle.id,
      marque: vehicle.brand,
      modele: vehicle.model,
      prixParJour: vehicle.pricePerDay,
      imageUrl: Array.isArray(images) && images.length > 0 
        ? images[0] 
        : null,
      titre: vehicle.title || `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
      adresse: vehicle.address || null,
      places: vehicle.capacity,
      note: notation.note,
      avis: notation.avis,
      images: images,
      commodites: features,
      disponible: vehicle.isActive,
      annee: vehicle.year,
      kilometrage: vehicle.mileage || null,
      transmission: vehicle.transmission,
      carburant: vehicle.fuelType,
      couleur: vehicle.color || null,
      etatGeneral: vehicle.condition || null,
      type: vehicle.type,
      numeroPlaque: vehicle.plateNumber || null,
      isVerified: vehicle.isVerified || false,
      nombreLocations: vehicle._count?.bookings || 0,
      proprietaire: vehicle.owner ? {
        id: vehicle.owner.id,
        email: vehicle.owner.email,
        nom: `${vehicle.owner.firstName} ${vehicle.owner.lastName}`,
        telephone: vehicle.owner.phone,
      } : null,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
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

  async update(id: string, updateVehicleDto: UpdateVehicleDto) {
    await this.findOne(id); // Vérifier que le véhicule existe

    const transformedData = this.transformVehicleDto(updateVehicleDto);
    const updated = await this.prisma.vehicle.update({
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
        reviews: {
          select: {
            rating: true,
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return this.formatVehicleResponse(updated);
  }

  async remove(id: string) {
    await this.findOne(id); // Vérifier que le véhicule existe

    return this.prisma.vehicle.update({
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
   * Récupère les véhicules d'un propriétaire
   */
  async findByOwner(ownerId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
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
    });

    return vehicles.map(vehicle => this.formatVehicleResponse(vehicle));
  }

  /**
   * Vérifie si un utilisateur est propriétaire d'un véhicule
   */
  async isOwner(vehicleId: string, userId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { ownerId: true },
    });

    if (!vehicle) {
      return false;
    }

    return vehicle.ownerId === userId;
  }

  async search(query: string) {
    // Convertir la query en enum si possible, sinon chercher dans les strings
    const vehicleTypes = Object.values(VehicleType);
    const matchingTypes = vehicleTypes.filter(type => 
      type.toLowerCase().includes(query.toLowerCase())
    );

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        AND: [
          { isActive: true },
          {
            OR: [
              { brand: { contains: query } },
              { model: { contains: query } },
              ...(matchingTypes.length > 0 ? [{ type: { in: matchingTypes } }] : []),
            ],
          },
        ],
      },
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
    });

    return vehicles.map(vehicle => this.formatVehicleResponse(vehicle));
  }

  async findByType(type: string) {
    // Valider que le type est un enum valide
    const vehicleType = Object.values(VehicleType).find(t => t === type);
    if (!vehicleType) {
      throw new NotFoundException('Type de véhicule invalide');
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        AND: [
          { isActive: true },
          { type: vehicleType },
        ],
      },
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
    });

    return vehicles.map(vehicle => this.formatVehicleResponse(vehicle));
  }

  /**
   * Retourne tous les types de véhicules disponibles
   */
  getVehicleTypes() {
    const types = Object.values(VehicleType);
    
    // Mapper les types avec leurs labels en français
    const typeLabels: Record<VehicleType, string> = {
      [VehicleType.CAR]: 'Voiture',
      [VehicleType.SUV]: 'SUV',
      [VehicleType.MOTORCYCLE]: 'Moto',
      [VehicleType.BICYCLE]: 'Vélo',
      [VehicleType.SCOOTER]: 'Scooter',
      [VehicleType.VAN]: 'Van',
      [VehicleType.TRUCK]: 'Camion',
    };

    return types.map(type => ({
      value: type,
      label: typeLabels[type] || type,
    }));
  }
}
