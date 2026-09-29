import type { Provider } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SECONDS } from '@nimbo/contracts';

import type { Env } from '../../../../shared';

/** Única constante de firma y verificación del token de acceso (ADR-0017 c.2, plan §6.4). Sin `iss` ni `aud` (DT-10). */
export interface AccessTokenOptions {
  readonly secret: string;
  readonly algorithms: readonly ['HS256'];
  readonly ttlSeconds: number;
}

export const ACCESS_TOKEN_OPTIONS = Symbol('ACCESS_TOKEN_OPTIONS');

export const accessTokenOptionsFrom = (env: Pick<Env, 'JWT_ACCESS_SECRET'>): AccessTokenOptions =>
  Object.freeze({
    secret: env.JWT_ACCESS_SECRET,
    algorithms: Object.freeze(['HS256'] as const),
    ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
  });

/** Proveedor de `ACCESS_TOKEN_OPTIONS`, construido una vez desde el entorno validado. */
export const accessTokenOptionsProvider = (env: Pick<Env, 'JWT_ACCESS_SECRET'>): Provider => ({
  provide: ACCESS_TOKEN_OPTIONS,
  useValue: accessTokenOptionsFrom(env),
});
