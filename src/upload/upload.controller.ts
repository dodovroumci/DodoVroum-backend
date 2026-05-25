import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadResponseDto } from './dto/upload-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const ASSETS_ROOT = '/var/www/dodovroum-assets';
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
}
