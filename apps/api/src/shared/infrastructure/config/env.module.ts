import { Module } from '@nestjs/common';

import { resolveSharedEnv } from './resolve-shared-env';

/** Token del entorno validado (`SharedEnv`). Interno de `shared`; los módulos de negocio reciben su config por puertos. */
export const ENV = Symbol('ENV');

/**
 * Provee `ENV` de forma perezosa (en el arranque, no al importar): CA-10 exige que importar `shared`
 * no lea el entorno. Lo importan los `forRootAsync` de logger, TypeORM y BullMQ dentro de `SharedModule`.
 */
@Module({
  providers: [
    { provide: ENV, useFactory: (): ReturnType<typeof resolveSharedEnv> => resolveSharedEnv() },
  ],
  exports: [ENV],
})
export class EnvModule {}
