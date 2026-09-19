import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { QueueOptions } from 'bullmq';

import { ENV } from './infrastructure/config/env.module';
import type { SharedEnvBase } from './infrastructure/config/env.schema';
import { createLoggerModule } from './infrastructure/logging/logger.module';
import { buildDataSourceOptions } from './infrastructure/persistence/data-source';
import { buildBullConnection } from './infrastructure/queue/bull.config';

/** Postgres y Redis deben responder para que el proceso termine de arrancar (plan 000 §6.2, cambio 9). */
const DB_RETRY_ATTEMPTS = 10;
const DB_RETRY_DELAY_MS = 3000;

/**
 * Módulo transversal sin parámetros: logger Pino, TypeORM (`autoLoadEntities`) y la conexión BullMQ,
 * configurados con el `ENV` (`SharedEnvBase`) que `EnvModule.forRoot` publica. Cada raíz de composición
 * (`AppModule`, `WorkerModule`) importa `EnvModule.forRoot(env)`, este módulo y añade lo suyo.
 */
@Module({
  imports: [
    createLoggerModule(),
    TypeOrmModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: SharedEnvBase): TypeOrmModuleOptions => ({
        ...buildDataSourceOptions(env),
        autoLoadEntities: true,
        retryAttempts: DB_RETRY_ATTEMPTS,
        retryDelay: DB_RETRY_DELAY_MS,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: SharedEnvBase): QueueOptions => ({
        connection: buildBullConnection(env.REDIS_URL),
      }),
    }),
  ],
})
export class SharedModule {}
