import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { RequestPrincipal } from './request-principal';

/** El `sid` del token de acceso; 002 lo usa para «esta sesión». Lee solo `RequestPrincipal`, nunca `req.user`. */
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => RequestPrincipal.require(ctx).sessionId,
);
