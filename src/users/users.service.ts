import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt'; // Ajout de l'import

export interface UserFilters {
  role?: string;
  type?: string;
  isOwner?: boolean;
}

/**
 * @class UsersService
 * @description Senior Implementation - Centralisation de la sécurité et Mapping
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly BCRYPT_SALT_ROUNDS = 12; // Standard de sécurité élevé

  constructor(private prisma: PrismaService) {}

  /**
   * Utilisé par l'AuthService pour la validation.
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByResetToken(token: string) {
    return this.prisma.user.findUnique({
      where: { resetPasswordToken: token },
    });
  }

  async findByIdForAuth(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true, refreshTokenHash: true },
    });
  }

  async updateRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { refreshTokenHash: hash } });
  }

  /**
   * Création sécurisée avec hashage automatique
   */
  async create(createUserDto: CreateUserDto) {
    try {
      const data = { ...createUserDto };

      // Normalisation de l'email avant toute vérification
      if (data.email) data.email = data.email.toLowerCase().trim();

      // Vérification d'unicité — évite que le catch générique avale le P2002
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Cet email est déjà utilisé.');

      if (data.password) {
        const salt = await bcrypt.genSalt(this.BCRYPT_SALT_ROUNDS);
        data.password = await bcrypt.hash(data.password, salt);
      }

      const user = await this.prisma.user.create({
        data,
        select: this.getUserSelectFull(),
      });
      return this.normalizeUser(user);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // Un compte soft-deleted garde son email en base (contrainte unique réelle) :
      // le pré-check ci-dessus ne le voit pas, donc la violation ne peut être détectée qu'ici.
      if (error.code === 'P2002') throw new ConflictException('Cet email est déjà utilisé.');
      this.logger.error(`[CREATE_USER_ERROR] ${error.message}`);
      throw new BadRequestException("Erreur lors de la création de l'utilisateur");
    }
  }

  async findAll(filters?: UserFilters) {
    const where: Prisma.UserWhereInput = {};

    if (filters?.role) {
      where.role = filters.role.toUpperCase() as UserRole;
    }
    if (filters?.isOwner) {
      where.role = UserRole.PROPRIETAIRE;
    }
    if (filters?.type) {
      where.typeProprietaire = filters.type;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: this.getUserSelectFull(),
      orderBy: { createdAt: 'desc' },
    });

    return users.map(user => this.normalizeUser(user));
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.getUserSelectFull(),
        localisation: true,
        typeProprietaire: true,
        residences: {
          where: { isActive: true },
          select: this.getResidenceSelect(),
        },
        vehicles: {
          where: { isActive: true },
          select: this.getVehicleSelect(),
        },
      },
    });

    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return this.normalizeUser(user);
  }

  async update(id: string, updateUserDto: any) {
    const data: any = { ...updateUserDto };

    // Hashage lors de l'update si le password est modifié
    if (data.password && !data.password.startsWith('$2')) {
      const salt = await bcrypt.genSalt(this.BCRYPT_SALT_ROUNDS);
      data.password = await bcrypt.hash(data.password, salt);
    }

    if (data.isVerified !== undefined) {
      data.isVerified = String(data.isVerified) === 'true' || data.isVerified === true;
    }
    if (data.isActive !== undefined) {
      data.isActive = String(data.isActive) === 'true' || data.isActive === true;
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
        select: this.getUserSelectFull(),
      });
      return this.normalizeUser(user);
    } catch (error) {
      this.logger.error(`[UPDATE_USER_ERROR] ${error.message}`);
      throw new BadRequestException("Échec de la mise à jour");
    }
  }

  async updateRole(id: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé.');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: this.getUserSelectFull(),
    });
    return this.normalizeUser(updated);
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé.');

    // Bloque si une réservation est "en cours" : clé remise au client ET séjour non terminé.
    // Couvre à la fois le cas client (locataire) et le cas propriétaire (résidence/véhicule/offre loués).
    const activeBookingCount = await this.prisma.booking.count({
      where: {
        keyRetrievedAt: { not: null },
        endDate: { gt: new Date() },
        OR: [
          { userId: id },
          { residence: { ownerId: id } },
          { vehicle: { ownerId: id } },
          { offer: { ownerId: id } },
        ],
      },
    });

    if (activeBookingCount > 0) {
      throw new ForbiddenException(
        `Ce compte ne peut être supprimé : ${activeBookingCount} réservation(s) en cours.`,
      );
    }

    await this.prisma.user.softDelete(id);
  }

  // Fields that must never appear in any API response, regardless of what Prisma returns.
  private static readonly BLOCKED_FIELDS = [
    'password',
    'refreshTokenHash',
    'resetPasswordToken',
    'resetPasswordExpires',
  ] as const;

  private normalizeUser(user: any) {
    if (!user) return null;

    // Defense-in-depth: strip sensitive fields unconditionally before returning.
    // This protects against accidental select inclusions in any query using this method.
    const safe = { ...user };
    for (const field of UsersService.BLOCKED_FIELDS) {
      delete safe[field];
    }

    const isVerified = !!safe.isVerified;
    const isActive = !!safe.isActive;
    return {
      ...safe,
      isVerified,
      isActive,
      verified: isVerified,
      active: isActive,
    };
  }

  private getUserSelectFull() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      avatar: true,
      isVerified: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      identityType: true,
      identityNumber: true,
      identityPhotoFront: true,
      identityPhotoBack: true,
      identityPhotoExtra: true,
    };
  }

  private getResidenceSelect() {
    return {
      id: true,
      title: true,
      pricePerDay: true,
      city: true,
      isVerified: true,
      typeResidence: true,
    };
  }

  private getVehicleSelect() {
    return {
      id: true,
      brand: true,
      model: true,
      pricePerDay: true,
      isVerified: true,
      type: true,
    };
  }
}
