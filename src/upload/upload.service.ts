import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  public readonly uploadPath: string;
  public readonly maxFileSize: number;
  public readonly allowedMimeTypes: string[];

  constructor(private configService: ConfigService) {
    // Chemin de stockage des fichiers
    this.uploadPath = this.configService.get<string>('UPLOAD_PATH') || './uploads';
    this.maxFileSize = this.configService.get<number>('MAX_FILE_SIZE') || 5 * 1024 * 1024; // 5MB par défaut
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    // Créer le dossier d'upload s'il n'existe pas
    this.ensureUploadDirectoryExists();
  }

  /**
   * Vérifier que le dossier d'upload existe, sinon le créer
   */
  private ensureUploadDirectoryExists(): void {
    const uploadDir = path.resolve(this.uploadPath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Créer les sous-dossiers
    const subDirs = ['residences', 'vehicles', 'users', 'identity'];
    subDirs.forEach((dir) => {
      const dirPath = path.join(uploadDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  /**
   * Valider le type de fichier
   */
  validateFileType(mimetype: string): boolean {
    return this.allowedMimeTypes.includes(mimetype);
  }

  /**
   * Valider la taille du fichier
   */
  validateFileSize(size: number): boolean {
    return size <= this.maxFileSize;
  }

  /**
   * Générer un nom de fichier unique
   */
  generateFileName(originalName: string, category: string): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    const uniqueId = uuidv4();
    return `${category}/${sanitizedBaseName}_${uniqueId}${ext}`;
  }

  /**
   * Obtenir l'URL publique du fichier
   */
  getFileUrl(fileName: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}/uploads/${fileName}`;
  }

  /**
   * Supprimer un fichier
   */
  async deleteFile(fileName: string): Promise<void> {
    const filePath = path.join(this.uploadPath, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Supprimer plusieurs fichiers
   */
  async deleteFiles(fileNames: string[]): Promise<void> {
    await Promise.all(fileNames.map((fileName) => this.deleteFile(fileName)));
  }

  /**
   * Obtenir le chemin complet du fichier
   */
  getFilePath(fileName: string): string {
    return path.join(this.uploadPath, fileName);
  }

  /**
   * Vérifier si un fichier existe
   */
  fileExists(fileName: string): boolean {
    const filePath = path.join(this.uploadPath, fileName);
    return fs.existsSync(filePath);
  }
}

