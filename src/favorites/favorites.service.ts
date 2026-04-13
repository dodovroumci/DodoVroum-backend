import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
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
      include: { residence: true, vehicle: true, offer: true }
    });
  }

  async findByUser(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: { residence: true, vehicle: true, offer: true }
    });
  }

  async findOne(id: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: { id },
      include: { residence: true, vehicle: true, offer: true }
    });
    if (!favorite) throw new NotFoundException('Favori non trouvé');
    return favorite;
  }

  async remove(id: string) {
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
