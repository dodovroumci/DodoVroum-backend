import { Injectable } from '@nestjs/common';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class PaginationService {
  validatePaginationOptions(options: PaginationOptions): PaginationOptions {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';

    return {
      page,
      limit,
      sortBy,
      sortOrder,
    };
  }

  calculateSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  calculatePaginationMeta(
    page: number,
    limit: number,
    total: number,
  ): PaginationResult<any>['pagination'] {
    const totalPages = Math.ceil(total / limit);
    
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
