import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        avatar: true,
        isVerified: true,
        localisation: true,
        typeProprietaire: true,
        // Inclure automatiquement les résidences et véhicules du propriétaire
        residences: {
          where: { isActive: true },
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
            isVerified: true,
            latitude: true,
            longitude: true,
            typeResidence: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                bookings: true,
                reviews: true,
                favorites: true,
              },
            },
          },
        },
        vehicles: {
          where: { isActive: true },
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
            type: true,
            pricePerDay: true,
            capacity: true,
            fuelType: true,
            transmission: true,
            isVerified: true,
            address: true,
            color: true,
            condition: true,
            mileage: true,
            title: true,
            plateNumber: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                bookings: true,
                reviews: true,
                favorites: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findById(id); // Vérifier que l'utilisateur existe

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id); // Vérifier que l'utilisateur existe

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
