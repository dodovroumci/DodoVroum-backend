import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ImagePathInterceptor implements NestInterceptor {
  private readonly publicUrl = 'https://dodovroum.com/storage';
  private readonly localUrl = 'http://127.0.0.1:8000/storage';

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.transform(data)),
    );
  }

  private transform(data: any): any {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.transform(item));
    }

    const transformed = { ...data };

    for (const key in transformed) {
      if (typeof transformed[key] === 'string' && transformed[key].includes(this.localUrl)) {
        transformed[key] = transformed[key].replace(this.localUrl, this.publicUrl);
      } else if (typeof transformed[key] === 'object' && transformed[key] !== null) {
        transformed[key] = this.transform(transformed[key]);
      }
    }

    return transformed;
  }
}
