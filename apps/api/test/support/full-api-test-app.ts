import type { DynamicModule, Type } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import type { Env } from '../../src/shared';
import { createTestApp } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';

/**
 * La API completa (`AppModule`, como `main.ts`) con la `JwtStrategy` real de `identity`: los tokens salen de
 * `realAccessTokenIssuer(env)` con el mismo `env`. `extraModules` se suman a la composición (p. ej. el `worker` de
 * correo, para que un alta llegue a Mailpit; ese caso pide un `env` construido con `withWorkerEnv`).
 */
export const createFullApiTestApp = (
  env: Env,
  extraModules: readonly (Type<unknown> | DynamicModule)[] = [],
): Promise<TestApp> =>
  createTestApp({
    modules: [AppModule.forRoot(env), ...extraModules],
    validatedEnv: env,
    accessTokenStrategy: 'identity',
  });

/** Correo de una cuenta sembrada (leído como el dueño); `''` si no existe. */
export const emailOfAccount = async (owner: DataSource, id: string): Promise<string> => {
  const rows = (await owner.query('SELECT correo FROM usuario WHERE id = $1', [id])) as {
    correo: string;
  }[];
  return rows[0]?.correo ?? '';
};
