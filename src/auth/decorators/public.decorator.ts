import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marque une route comme accessible sans JWT (utile si un guard global est ajouté plus tard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
