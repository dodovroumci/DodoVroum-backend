import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        
        if (redisUrl) {
          return {
            store: 'redis',
            url: redisUrl,
            ttl: 300, // 5 minutes par défaut
            max: 1000, // Maximum 1000 entrées
          };
        }
        
        // Fallback vers cache mémoire si Redis n'est pas disponible
        return {
          ttl: 300,
          max: 1000,
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService],
  exports: [CacheModule, CacheService],
})
export class CacheConfigModule {}
