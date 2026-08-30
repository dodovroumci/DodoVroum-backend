import {
  Controller,
  Post,
  Put,
  Param,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadResponseDto } from './dto/upload-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { diskStorage, memoryStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const ASSETS_ROOT = '/var/www/dodovroum-assets';
// Sauvegardes créées par /upload/replace avant tout écrasement — sous ASSETS_ROOT
// pour rester sur le même volume/disque (pas d'infra supplémentaire à provisionner).
const BACKUP_ROOT = '/var/www/dodovroum-assets/.backups';
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Strict whitelist — never use user input directly in path.join
const ALLOWED_CATEGORIES = ['residences', 'vehicles', 'users', 'identity', 'general'] as const;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

function imageFileFilter(
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, accept: boolean) => void,
) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = (ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype);
  const extOk  = (ALLOWED_EXTENSIONS  as readonly string[]).includes(ext);

  if (mimeOk && extOk) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Type de fichier non autorisé. Formats acceptés : JPG, PNG, WebP, GIF'), false);
  }
}
type AllowedCategory = typeof ALLOWED_CATEGORIES[number];

function sanitizeCategory(raw: unknown): AllowedCategory {
  return ALLOWED_CATEGORIES.includes(raw as AllowedCategory)
    ? (raw as AllowedCategory)
    : 'general';
}

// Contrairement à sanitizeCategory (qui retombe sur 'general' pour une création),
// replace/restore ciblent un fichier précis : une catégorie inconnue doit être
// rejetée plutôt que silencieusement redirigée vers un autre dossier.
function assertValidCategory(raw: unknown): AllowedCategory {
  if (!ALLOWED_CATEGORIES.includes(raw as AllowedCategory)) {
    throw new BadRequestException(`Catégorie invalide. Valeurs autorisées : ${ALLOWED_CATEGORIES.join(', ')}`);
  }
  return raw as AllowedCategory;
}

// Nom de fichier généré par multer lors de l'upload initial : uuidv4 + extension
// whitelistée. Toute valeur qui ne correspond pas exactement à ce format est
// refusée — empêche tout path traversal et empêche de cibler un fichier situé
// hors de ce schéma de nommage.
const GENERATED_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif)$/i;

function assertValidFilename(raw: string): string {
  if (!GENERATED_FILENAME_PATTERN.test(raw)) {
    throw new BadRequestException('Nom de fichier invalide.');
  }
  return raw;
}

const multerConfig = diskStorage({
  destination: (req, file, cb) => {
    // req.body may be partially parsed for multipart — always sanitize
    const category = sanitizeCategory(req.body?.category);
    // Safe: category is one of the whitelisted string literals, never user-controlled
    const uploadPath = path.join(ASSETS_ROOT, category);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      fs.chmodSync(uploadPath, '775');
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload') // Répond à /upload
export class UploadController {

  @Post(['single', 'image']) // Alias : Répond à /upload/single ET /upload/image
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: multerConfig,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFileFilter,
  }))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
  ): Promise<UploadResponseDto> {
    if (!file) throw new BadRequestException('Fichier non reçu ou trop gros');

    const finalCategory = sanitizeCategory(category);
    const publicUrl = `https://dodovroum.com/storage/${finalCategory}/${file.filename}`;

    return {
      fileName: file.filename,
      url: publicUrl,
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname,
    };
  }

  @Post(['multiple', 'images'])
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10, {
    storage: multerConfig,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFileFilter,
  }))
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('category') category: string,
  ): Promise<UploadResponseDto[]> {
    if (!files || files.length === 0) throw new BadRequestException('Aucun fichier fourni');
    const finalCategory = sanitizeCategory(category);
    return files.map((file) => ({
      fileName: file.filename,
      url: `https://dodovroum.com/storage/${finalCategory}/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname,
    }));
  }

  /**
   * [Admin] Remplace le contenu binaire d'une image déjà existante, sans jamais
   * changer son nom de fichier (donc sans jamais nécessiter de mise à jour des
   * références en base ailleurs dans l'app). Réservé à la maintenance/optimisation
   * d'images legacy (voir dashboard: php artisan images:optimize).
   *
   * Ne peut JAMAIS créer de nouveau fichier : 404 si la cible n'existe pas déjà.
   * Sauvegarde automatiquement l'original avant tout écrasement (jamais réécrasée
   * si un backup existe déjà, pour ne jamais perdre la toute première version).
   */
  @Put('replace/:category/:filename')
  @ApiOperation({ summary: "[Admin] Remplace le contenu d'une image existante (même nom de fichier). Sauvegarde automatique avant écrasement." })
  @ApiConsumes('multipart/form-data')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFileFilter,
  }))
  async replaceImage(
    @Param('category') categoryParam: string,
    @Param('filename') filenameParam: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: true; category: string; filename: string; previousSize: number; newSize: number; backedUp: boolean }> {
    if (!file) throw new BadRequestException('Fichier non reçu ou trop gros');

    const category = assertValidCategory(categoryParam);
    const filename = assertValidFilename(filenameParam);

    // Le nom de fichier ne change jamais : le binaire envoyé doit donc avoir la
    // même extension que la cible, sinon le Content-Type servi divergerait du
    // contenu réel.
    const targetExt = path.extname(filename).toLowerCase();
    const uploadedExt = path.extname(file.originalname).toLowerCase();
    if (uploadedExt && uploadedExt !== targetExt) {
      throw new BadRequestException(
        `Le fichier envoyé (${uploadedExt || 'sans extension'}) doit avoir la même extension que la cible (${targetExt}).`,
      );
    }

    const targetPath = path.join(ASSETS_ROOT, category, filename);
    if (!fs.existsSync(targetPath)) {
      throw new NotFoundException(`Aucune image existante à remplacer : ${category}/${filename}`);
    }

    const previousSize = fs.statSync(targetPath).size;

    const backupDir = path.join(BACKUP_ROOT, category);
    const backupPath = path.join(backupDir, filename);
    let backedUp = false;
    if (!fs.existsSync(backupPath)) {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        fs.chmodSync(backupDir, '775');
      }
      fs.copyFileSync(targetPath, backupPath);
      backedUp = true;
    }

    // Écriture atomique (fichier temporaire + rename) : une requête concurrente
    // ne peut jamais lire un fichier à moitié écrit.
    const tmpPath = `${targetPath}.tmp-${uuidv4()}`;
    fs.writeFileSync(tmpPath, file.buffer);
    fs.renameSync(tmpPath, targetPath);

    return {
      success: true,
      category,
      filename,
      previousSize,
      newSize: file.buffer.length,
      backedUp,
    };
  }

  /**
   * [Admin] Restaure la version originale d'une image depuis la sauvegarde
   * automatique créée par /upload/replace — procédure de rollback.
   */
  @Post('restore/:category/:filename')
  @ApiOperation({ summary: "[Admin] Restaure la version originale d'une image depuis sa sauvegarde." })
  @UseGuards(AdminGuard)
  async restoreImage(
    @Param('category') categoryParam: string,
    @Param('filename') filenameParam: string,
  ): Promise<{ success: true; category: string; filename: string }> {
    const category = assertValidCategory(categoryParam);
    const filename = assertValidFilename(filenameParam);

    const backupPath = path.join(BACKUP_ROOT, category, filename);
    if (!fs.existsSync(backupPath)) {
      throw new NotFoundException(`Aucune sauvegarde disponible pour ${category}/${filename}`);
    }

    const targetPath = path.join(ASSETS_ROOT, category, filename);
    const tmpPath = `${targetPath}.tmp-${uuidv4()}`;
    fs.copyFileSync(backupPath, tmpPath);
    fs.renameSync(tmpPath, targetPath);

    return { success: true, category, filename };
  }
}
