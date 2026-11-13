import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { WORKER_OBJECT_STORAGE_PROVIDER } from '../modules/storage';
import { EnvModule, MinioConfigModule, SharedModule } from '../shared';
import type { Env } from '../shared';

import { DemoSeeder, SEED_INPUT } from './demo-seeder';
import type { SeedInput } from './demo-seeder';
import { SeedStore } from './seed-store';

/**
 * Raíz de composición de la semilla de demostración (`scripts/seed.ts`): contexto Nest sin HTTP, como
 * `BootstrapAdminModule`. Solo lo que la semilla usa: la conexión `nimbo_app` con `ITransactionRunner` y el hash
 * Argon2id (`SharedModule`) y MinIO con el adaptador de `storage`.
 */
@Module({})
export class SeedModule {
  static forRoot(env: Env, input: SeedInput): DynamicModule {
    return {
      module: SeedModule,
      imports: [EnvModule.forRoot(env), SharedModule, MinioConfigModule.forRoot(env)],
      providers: [
        WORKER_OBJECT_STORAGE_PROVIDER,
        SeedStore,
        DemoSeeder,
        { provide: SEED_INPUT, useValue: input },
      ],
    };
  }
}
