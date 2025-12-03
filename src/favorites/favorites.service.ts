import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async create(createFavoriteDto: CreateFavoriteDto, userId: string) {
    // Vérifier qu'au moins un ID est fourni
    if (!createFavoriteDto.residenceId && !createFavoriteDto.vehicleId && !createFavoriteDto.offerId) {
      throw new BadRequestException('Vous devez fournir au moins un ID (residenceId, vehicleId ou offerId)');
    }

    const results = [];

    // Traiter la résidence si fournie
    if (createFavoriteDto.residenceId) {
      const residence = await this.prisma.residence.findUnique({
        where: { id: createFavoriteDto.residenceId },
      });

      if (!residence) {
        throw new NotFoundException(`Résidence avec l'ID ${createFavoriteDto.residenceId} non trouvée`);
      }

      if (!residence.isActive) {
        throw new BadRequestException('Cette résidence n\'est plus disponible');
      }

      // Vérifier si le favori existe déjà
      const existingFavorite = await this.prisma.favorite.findFirst({
        where: {
          userId,
          residenceId: createFavoriteDto.residenceId,
        },
      });

      if (existingFavorite) {
        throw new BadRequestException('Cette résidence est déjà dans vos favoris');
      }

      // Créer le favori pour la résidence
      const favorite = await this.prisma.favorite.create({
        data: {
          userId,
          residenceId: createFavoriteDto.residenceId,
        },
        include: {
          residence: true,
          vehicle: true,
          offer: {
            include: {
              residence: true,
              vehicle: true,
            },
          },
        },
      });

      results.push(favorite);
    }

    // Traiter le véhicule si fourni
    if (createFavoriteDto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: createFavoriteDto.vehicleId },
      });

      if (!vehicle) {
        throw new NotFoundException(`Véhicule avec l'ID ${createFavoriteDto.vehicleId} non trouvé`);
      }

      if (!vehicle.isActive) {
        throw new BadRequestException('Ce véhicule n\'est plus disponible');
      }

      // Vérifier si le favori existe déjà
      const existingFavorite = await this.prisma.favorite.findFirst({
        where: {
          userId,
          vehicleId: createFavoriteDto.vehicleId,
        },
      });

      if (existingFavorite) {
        throw new BadRequestException('Ce véhicule est déjà dans vos favoris');
      }

      // Créer le favori pour le véhicule
      const favorite = await this.prisma.favorite.create({
        data: {
          userId,
          vehicleId: createFavoriteDto.vehicleId,
        },
        include: {
          residence: true,
          vehicle: true,
          offer: {
            include: {
              residence: true,
              vehicle: true,
            },
          },
        },
      });

      results.push(favorite);
    }

    // Traiter l'offre si fournie
    if (createFavoriteDto.offerId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: createFavoriteDto.offerId },
      });

      if (!offer) {
        throw new NotFoundException(`Offre avec l'ID ${createFavoriteDto.offerId} non trouvée`);
      }

      if (!offer.isActive) {
        throw new BadRequestException('Cette offre n\'est plus disponible');
      }

      // Vérifier que l'offre est toujours valide
      const now = new Date();
      if (now < offer.validFrom || now > offer.validTo) {
        throw new BadRequestException('Cette offre n\'est plus valide (hors période de validité)');
      }

      // Vérifier si le favori existe déjà
      const existingFavorite = await this.prisma.favorite.findFirst({
        where: {
          userId,
          offerId: createFavoriteDto.offerId,
        },
      });

      if (existingFavorite) {
        throw new BadRequestException('Cette offre est déjà dans vos favoris');
      }

      // Créer le favori pour l'offre
      const favorite = await this.prisma.favorite.create({
        data: {
          userId,
          offerId: createFavoriteDto.offerId,
        },
        include: {
          residence: true,
          vehicle: true,
          offer: {
            include: {
              residence: true,
              vehicle: true,
            },
          },
        },
      });

      results.push(favorite);
    }

    // Retourner un seul favori si un seul a été créé, sinon retourner un tableau
    return results.length === 1 ? results[0] : results;
  }

  async findAll() {
    return this.prisma.favorite.findMany({
      include: {
        residence: true,
        vehicle: true,
        offer: {
          include: {
            residence: true,
            vehicle: true,
          },
        },
      },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        residence: true,
        vehicle: true,
        offer: {
          include: {
            residence: true,
            vehicle: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: { id },
      include: {
        residence: true,
        vehicle: true,
        offer: {
          include: {
            residence: true,
            vehicle: true,
          },
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favori non trouvé');
    }

    return favorite;
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.favorite.delete({
      where: { id },
    });
  }

  async removeByUserAndItem(userId: string, residenceId?: string, vehicleId?: string, offerId?: string) {
    const whereClause: any = { userId };
    
    if (residenceId) {
      whereClause.residenceId = residenceId;
    }
    
    if (vehicleId) {
      whereClause.vehicleId = vehicleId;
    }

    if (offerId) {
      whereClause.offerId = offerId;
    }

    return this.prisma.favorite.deleteMany({
      where: whereClause,
    });
  }
}
