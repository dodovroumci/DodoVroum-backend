import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { safeResidenceSelect, safeVehicleSelect, safeOfferSelect } from '../common/prisma/safe-selects';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateFavoriteDto, userId: string) {
    const { residenceId, vehicleId, offerId } = dto;
    if (!residenceId && !vehicleId && !offerId) {
      throw new BadRequestException('Au moins un ID (résidence, véhicule ou offre) est requis.');
    }

    // Création du favori
    return this.prisma.favorite.create({
      data: {
        userId,
        residenceId: residenceId || null,
        vehicleId: vehicleId || null,
        offerId: offerId || null,
      },
    });
  }

  async findAll() {
    return this.prisma.favorite.findMany({
      include: {
        residence: { select: safeResidenceSelect },
        vehicle: { select: safeVehicleSelect },
        offer: { select: safeOfferSelect },
      }
    });
  }

  async findByUser(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        residence: { select: safeResidenceSelect },
        vehicle: { select: safeVehicleSelect },
        offer: { select: safeOfferSelect },
      }
    });
  }

  async findOne(id: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: { id },
      include: {
        residence: { select: safeResidenceSelect },
        vehicle: { select: safeVehicleSelect },
        offer: { select: safeOfferSelect },
      }
    });
    if (!favorite) throw new NotFoundException('Favori non trouvé');
    return favorite;
  }

  async remove(id: string, requestingUserId: string, requestingRole: string) {
    const favorite = await this.findOne(id);
    if (requestingRole !== 'ADMIN' && favorite.userId !== requestingUserId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres favoris.');
    }
    return this.prisma.favorite.delete({ where: { id } });
  }

  async removeByUserAndItem(userId: string, residenceId?: string, vehicleId?: string, offerId?: string) {
    const favorite = await this.prisma.favorite.findFirst({
      where: { userId, residenceId, vehicleId, offerId }
    });
    if (!favorite) throw new NotFoundException('Favori non trouvé');
    return this.prisma.favorite.delete({ where: { id: favorite.id } });
  }
}
