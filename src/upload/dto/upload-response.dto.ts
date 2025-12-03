import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({ example: 'residences/villa_luxueuse_abc123.jpg' })
  fileName: string;

  @ApiProperty({ example: 'http://localhost:3000/uploads/residences/villa_luxueuse_abc123.jpg' })
  url: string;

  @ApiProperty({ example: 1024000 })
  size: number;

  @ApiProperty({ example: 'image/jpeg' })
  mimetype: string;

  @ApiProperty({ example: 'villa_luxueuse.jpg' })
  originalName: string;
}

