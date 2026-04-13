import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service de gestion des fichiers (Upload & Storage)
 * Architecture SOLID - Utilise process.env pour le boot pour éviter les crashs d'injection NestJS.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  
  public readonly uploadPath: string;
  public readonly maxFileSize: number;
  public readonly allowedMimeTypes: string[] = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  constructor(private readonly configService: ConfigService) {
    // Utilisation de process.env au démarrage pour garantir la disponibilité des variables
    this.uploadPath = process.env.UPLOAD_PATH || './uploads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10); // 5MB default

    this.ensureUploadDirectoryExists();
  }

  /**
   * Initialisation du système de fichiers
   */
  private ensureUploadDirectoryExists(): void {
    const rootPath = path.resolve(this.uploadPath);
    try {
      if (!fs.existsSync(rootPath)) {
        fs.mkdirSync(rootPath, { recursive: true });
        this.logger.log(`✅ Dossier racine d'upload créé : ${rootPath}`);
      }

      const categories = ['residences', 'vehicles', 'users', 'identity'];
      categories.forEach((dir) => {
        const subDir = path.join(rootPath, dir);
        if (!fs.existsSync(subDir)) {
          fs.mkdirSync(subDir, { recursive: true });
        }
      });
    } catch (error) {
      this.logger.error(`❌ Impossible de créer les dossiers d'upload: ${error.message}`);
    }
  }

  /**
   * Valide le type MIME d'un fichier
   */
  validateFileType(mimetype: string): boolean {
    return this.allowedMimeTypes.includes(mimetype);
  }

  /**
   * Valide la taille d'un fichier (en octets)
   */
  validateFileSize(size: number): boolean {
    return size <= this.maxFileSize;
  }

  /**
   * Génère un nom de fichier unique et sécurisé
   */
  generateFileName(originalName: string, category: string): string {
    const ext = path.extname(originalName);
    const sanitizedBaseName = path.basename(originalName, ext)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    
    return `${category}/${sanitizedBaseName}_${uuidv4()}${ext}`;
  }

  /**
   * Retourne l'URL publique pour accéder au fichier
   */
  getFileUrl(fileName: string): string {
    // Ici, configService est déjà initialisé par NestJS
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}/uploads/${fileName}`;
  }

  /**
   * Récupère le chemin absolu sur le disque
   */
  getFilePath(fileName: string): string {
    return path.join(this.uploadPath, fileName);
  }

  /**
   * Vérifie l'existence physique d'un fichier
   */
  fileExists(fileName: string): boolean {
    return fs.existsSync(this.getFilePath(fileName));
  }

  /**
   * Supprime un fichier du stockage
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      const filePath = this.getFilePath(fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.error(`Erreur suppression fichier ${fileName}: ${error.message}`);
    }
  }

  /**
   * Supprime une liste de fichiers
   */
  async deleteFiles(fileNames: string[]): Promise<void> {
    await Promise.all(fileNames.map((name) => this.deleteFile(name)));
  }
}
