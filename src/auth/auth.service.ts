import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null; // Ne pas révéler si l'utilisateur existe
    }

    if (!user.isActive) {
      return null; // Utilisateur désactivé
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null; // Mot de passe incorrect
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(user: any): Promise<LoginResponse> {
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role,
      type: 'access'
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh'
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async register(registerData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<LoginResponse> {
    try {
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await this.usersService.findByEmail(registerData.email);
      if (existingUser) {
        throw new BadRequestException('Cet email est déjà utilisé');
      }

      // La validation du mot de passe est déjà faite par le DTO (MinLength(8))

      // Hacher le mot de passe avec un salt plus fort
      const hashedPassword = await bcrypt.hash(registerData.password, 12);

      // Créer l'utilisateur
      const user = await this.usersService.create({
        ...registerData,
        password: hashedPassword,
      });

      // Générer les tokens
      return this.login(user);
    } catch (error) {
      // Si c'est déjà une BadRequestException, la relancer
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Gérer les erreurs Prisma (contraintes d'unicité, etc.)
      if (error?.code === 'P2002') {
        // Erreur de contrainte unique Prisma
        const field = error.meta?.target?.[0] || 'champ';
        throw new BadRequestException(`Cette ${field} est déjà utilisée`);
      }

      // Logger l'erreur pour le debugging
      console.error('Erreur lors de l\'inscription:', error);

      // Erreur générique avec plus de détails en développement
      const errorMessage = process.env.NODE_ENV === 'development' 
        ? `Erreur lors de la création du compte: ${error?.message || String(error)}`
        : 'Erreur lors de la création du compte. Veuillez réessayer.';
      
      throw new BadRequestException(errorMessage);
    }
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token invalide');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Utilisateur non trouvé ou inactif');
      }

      const accessPayload = {
        email: user.email,
        sub: user.id,
        role: user.role,
        type: 'access'
      };

      const access_token = await this.jwtService.signAsync(accessPayload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      });

      return { access_token };
    } catch (error) {
      throw new UnauthorizedException('Token de rafraîchissement invalide');
    }
  }

  async logout(userId: string): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    // Dans une implémentation complète, on ajouterait le token à une blacklist
    // Pour l'instant, on se contente de valider la demande
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
  }

  async validateToken(token: string): Promise<{ valid: boolean; user?: any }> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      
      if (payload.type !== 'access') {
        return { valid: false };
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        return { valid: false };
      }

      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    } catch (error) {
      return { valid: false };
    }
  }
}