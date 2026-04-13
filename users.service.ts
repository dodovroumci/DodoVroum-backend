import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

/**
 * @class UsersService
 * @description Gestion complète des utilisateurs et de l'identité pour DodoVroum
 */
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Création d'un utilisateur avec hashage et stockage des documents d'identité
   */
  async create(createUserDto: CreateUserDto) {
    const { password, ...rest } = createUserDto;

    const existing = await this.prisma.user.findUnique({ where: { email: rest.email } });
    if (existing) throw new BadRequestException('Cet email est déjà utilisé');

    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
        isActive: true,
      },
    });
  }

  /**
   * Récupération par ID (Inclus les champs identityType, identityPhotoFront, etc.)
   */
  async findById(id: string) {
  const user = await this.prisma.user.findUnique({
    where: { id },
    // On n'utilise PAS de "select" ici pour tout récupérer par défaut
    include: {
      identityVerification: true,
    },
  });

  if (!user) throw new NotFoundException(`User ${id} not found`);
  return user;
}

  /**
   * Liste filtrée pour le dashboard et l'app
   */
  async findAll(filters: { role?: string; type?: string; isOwner?: boolean }) {
    const { role, isOwner } = filters;

    return this.prisma.user.findMany({
      where: {
        ...(role && { role: role as any }),
        ...(isOwner !== undefined && { isVerified: isOwner }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        isVerified: true,
        identityType: true,
        createdAt: true,
      }
    });
  }

  /**
   * Mise à jour profil/identité
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    const { password, ...data } = updateUserDto;
    const updateData: any = { ...data };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      throw new BadRequestException("Échec de la mise à jour de l'utilisateur");
    }
  }

  /**
   * Suppression sécurisée
   */
  async remove(id: string) {
    const user = await this.findById(id);
    return this.prisma.user.delete({ where: { id: user.id } });
  }

  /**
   * Validation pour le service d'authentification
   */
  async validateUser(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(pass, user.password))) {
      return user;
    }
    return null;
  }
}
