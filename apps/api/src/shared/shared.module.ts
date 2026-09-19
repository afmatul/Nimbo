import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { QueueOptions } from 'bullmq';

import { ENV, EnvModule } from './infrastructure/config/env.module';
import type { SharedEnv } from './infrastructure/config/resolve-shared-env';
import { createLoggerModule } from './infrastructure/logging/logger.module';
import { buildDataSourceOptions } from './infrastructure/persistence/data-source';
import { buildBullConnection } from './infrastructure/queue/bull.config';

/** Postgres y Redis deben responder para que el proceso termine de arrancar (plan 000 §6.2, cambio 9). */
const DB_RETRY_ATTEMPTS = 10;
const DB_RETRY_DELAY_MS = 3000;

/**
 * Módulo transversal sin parámetros: entorno validado, logger Pino, TypeORM (`autoLoadEntities`) y la
 * conexión BullMQ. Cada raíz de composición (`AppModule`, `WorkerModule`) lo importa y añade lo suyo.
 */
@Module({
  imports: [
    EnvModule,
    createLoggerModule(),
    TypeOrmModule.forRootAsync({
      imports: [EnvModule],
      inject: [ENV],
      useFactory: (env: SharedEnv): TypeOrmModuleOptions => ({
        ...buildDataSourceOptions(env),
        autoLoadEntities: true,
        retryAttempts: DB_RETRY_ATTEMPTS,
        retryDelay: DB_RETRY_DELAY_MS,
      }),
    }),
    BullModule.forRootAsync({
      imports: [EnvModule],
      inject: [ENV],
      useFactory: (env: SharedEnv): QueueOptions => ({
        connection: buildBullConnection(env.REDIS_URL),
      }),
    }),
  ],
  exports: [EnvModule],
})
export class SharedModule {}
