import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { Actor } from '../../domain/actor';

import { RequestPrincipal } from './request-principal';

/** El `Actor` que armó `JwtAuthGuard` desde el token (003 CA-4). Lee solo `RequestPrincipal`, nunca `req.user`. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => RequestPrincipal.require(ctx).actor,
);
