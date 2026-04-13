import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { PrismaModule } from '../common/prisma/prisma.module'; // Le chemin trouvé avec find

@Module({
  imports: [PrismaModule], // INDISPENSABLE pour utiliser Prisma dans ce module
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
