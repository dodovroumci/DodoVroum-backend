import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { UploadResponseDto } from './dto/upload-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { diskStorage } from 'multer';
import * as path from 'path';

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @ApiOperation({ 
    summary: 'Uploader une image',
    description: 'Upload une image pour une résidence, un véhicule, un utilisateur ou un document d\'identité'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        category: {
          type: 'string',
          enum: ['residences', 'vehicles', 'users', 'identity'],
          description: 'Catégorie du fichier',
        },
      },
      required: ['file', 'category'],
    },
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Image uploadée avec succès',
    type: UploadResponseDto,
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Fichier invalide (type ou taille)' 
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const category = req.body.category || 'general';
          const uploadPath = path.join(process.cwd(), 'uploads', category);
          // Créer le dossier s'il n'existe pas
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
          const uniqueId = require('uuid').v4();
          cb(null, `${sanitizedBaseName}_${uniqueId}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Type de fichier non autorisé. Types acceptés: ${allowedMimeTypes.join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB par défaut
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Validation supplémentaire
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxFileSize) {
      // Supprimer le fichier si la taille est invalide
      const fs = require('fs');
      const filePath = path.join(process.cwd(), 'uploads', req.body.category || 'general', file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw new BadRequestException(
        `Fichier trop volumineux. Taille maximale: ${maxFileSize / 1024 / 1024}MB`,
      );
    }

    const category = req.body.category || 'general';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const fileName = `${category}/${file.filename}`;
    const url = `${baseUrl}/uploads/${fileName}`;

    return {
      fileName,
      url,
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname,
    };
  }

  @Post('images')
  @ApiOperation({ 
    summary: 'Uploader plusieurs images',
    description: 'Upload plusieurs images en une seule requête'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        category: {
          type: 'string',
          enum: ['residences', 'vehicles', 'users', 'identity'],
        },
      },
      required: ['files', 'category'],
    },
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Images uploadées avec succès',
    type: [UploadResponseDto],
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const category = req.body.category || 'general';
          const uploadPath = path.join(process.cwd(), 'uploads', category);
          // Créer le dossier s'il n'existe pas
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
          const uniqueId = require('uuid').v4();
          cb(null, `${sanitizedBaseName}_${uniqueId}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Type de fichier non autorisé'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB par défaut
      },
    }),
  )
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ): Promise<UploadResponseDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    const category = req.body.category || 'general';
    const results: UploadResponseDto[] = [];

    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const fs = require('fs');

    for (const file of files) {
      if (file.size > maxFileSize) {
        // Supprimer le fichier si la taille est invalide
        const filePath = path.join(process.cwd(), 'uploads', category, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        continue; // Ignorer les fichiers trop volumineux
      }

      const fileName = `${category}/${file.filename}`;
      const url = `${baseUrl}/uploads/${fileName}`;

      results.push({
        fileName,
        url,
        size: file.size,
        mimetype: file.mimetype,
        originalName: file.originalname,
      });
    }

    return results;
  }
}

