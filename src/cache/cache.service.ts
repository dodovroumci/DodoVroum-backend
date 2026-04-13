import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async reset(): Promise<void> {
    await this.cacheManager.reset();
  }

  // Méthodes spécialisées pour différents types de données
  async getUser(userId: string): Promise<any> {
    return await this.get(`user:${userId}`);
  }

  async setUser(userId: string, user: any, ttl: number = 300): Promise<void> {
    await this.set(`user:${userId}`, user, ttl);
  }

  async getResidences(page: number, limit: number, filters?: any): Promise<any> {
    const cacheKey = `residences:${page}:${limit}:${JSON.stringify(filters || {})}`;
    return await this.get(cacheKey);
  }

  async setResidences(page: number, limit: number, residences: any, filters?: any, ttl: number = 300): Promise<void> {
    const cacheKey = `residences:${page}:${limit}:${JSON.stringify(filters || {})}`;
    await this.set(cacheKey, residences, ttl);
  }

  async getVehicles(page: number, limit: number, filters?: any): Promise<any> {
    const cacheKey = `vehicles:${page}:${limit}:${JSON.stringify(filters || {})}`;
    return await this.get(cacheKey);
  }

  async setVehicles(page: number, limit: number, vehicles: any, filters?: any, ttl: number = 300): Promise<void> {
    const cacheKey = `vehicles:${page}:${limit}:${JSON.stringify(filters || {})}`;
    await this.set(cacheKey, vehicles, ttl);
  }

  async getUserBookings(userId: string): Promise<any> {
    return await this.get(`user_bookings:${userId}`);
  }

  async setUserBookings(userId: string, bookings: any, ttl: number = 180): Promise<void> {
    await this.set(`user_bookings:${userId}`, bookings, ttl);
  }

  // Invalidation intelligente
  async invalidateUserCache(userId: string): Promise<void> {
    await this.del(`user:${userId}`);
    await this.del(`user_bookings:${userId}`);
  }

  async invalidateResidencesCache(): Promise<void> {
    // Dans une implémentation complète, on utiliserait des patterns Redis
    // Pour l'instant, on supprime les caches les plus récents
    const keys = await this.getCacheKeys('residences:*');
    for (const key of keys) {
      await this.del(key);
    }
  }

  async invalidateVehiclesCache(): Promise<void> {
    const keys = await this.getCacheKeys('vehicles:*');
    for (const key of keys) {
      await this.del(key);
    }
  }

  private async getCacheKeys(pattern: string): Promise<string[]> {
    // Dans une implémentation Redis complète, on utiliserait SCAN
    // Pour l'instant, on retourne un tableau vide
    return [];
  }

  // Cache pour les sessions JWT
  async getSession(sessionId: string): Promise<any> {
    return await this.get(`session:${sessionId}`);
  }

  async setSession(sessionId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    await this.set(`session:${sessionId}`, sessionData, ttl);
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }
}
