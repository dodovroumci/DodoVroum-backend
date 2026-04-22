import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Récupère l'utilisateur injecté par le JwtAuthGuard depuis request.user.
 */
export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
