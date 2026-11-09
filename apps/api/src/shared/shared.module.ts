import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { QueueOptions } from 'bullmq';

import { I_TRANSACTION_RUNNER } from './application/persistence/i-transaction-runner.port';
import { I_ATTEMPT_LOCKOUT } from './application/rate-limit/i-attempt-lockout.port';
import { I_RATE_LIMITER } from './application/rate-limit/i-rate-limiter.port';
import { I_PASSWORD_HASHER } from './application/security/i-password-hasher.port';
import { I_CLOCK } from './domain/i-clock.port';
import { SystemClock } from './infrastructure/clock/system.clock';
import { ENV } from './infrastructure/config/env.module';
import type { SharedEnvBase } from './infrastructure/config/env.schema';
import { createLoggerModule } from './infrastructure/logging/logger.module';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { QueueMetricsCollector } from './infrastructure/metrics/queue-metrics.collector';
import { buildDataSourceOptions } from './infrastructure/persistence/data-source';
import { DatabaseRoleCheck } from './infrastructure/persistence/database-role.check';
import { TransactionContext } from './infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from './infrastructure/persistence/typeorm-transaction-runner';
import { buildBullConnection } from './infrastructure/queue/bull.config';
import { RedisAttemptLockout } from './infrastructure/rate-limit/redis-attempt-lockout';
import { RedisRateLimiter } from './infrastructure/rate-limit/redis-rate-limiter';
import { REDIS_CLIENT, redisClientProviders } from './infrastructure/redis/redis-client.provider';
import { Argon2idHasher } from './infrastructure/security/argon2id.hasher';

/** Postgres y Redis deben responder para que el proceso termine de arrancar (plan 000 §6.2, cambio 9). */
const DB_RETRY_ATTEMPTS = 10;
const DB_RETRY_DELAY_MS = 3000;

/**
 * Módulo transversal sin parámetros: logger Pino, TypeORM (`autoLoadEntities`) y la conexión BullMQ,
 * configurados con el `ENV` (`SharedEnvBase`) que `EnvModule.forRoot` publica. Cada raíz de composición
 * (`AppModule`, `WorkerModule`) importa `EnvModule.forRoot(env)`, este módulo y añade lo suyo.
 * Global (001 plan §6.7): los módulos de negocio inyectan `I_CLOCK`, `REDIS_CLIENT`, `I_RATE_LIMITER`,
 * `I_TRANSACTION_RUNNER`, `TransactionContext`, `I_PASSWORD_HASHER` e `I_ATTEMPT_LOCKOUT` (plan 013 D-2) sin
 * importarlo; las pruebas sustituyen `I_CLOCK` con `FixedClock`.
 * `DatabaseRoleCheck` impide arrancar si la conexión no es la de `nimbo_app` (003 plan §6.4).
 * `QueueMetricsCollector` (022) cuenta las colas que consume cada proceso en el registro de `MetricsModule`.
 */
@Global()
@Module({
  imports: [
    createLoggerModule(),
    MetricsModule,
    DiscoveryModule,
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
  providers: [
    { provide: I_CLOCK, useClass: SystemClock },
    ...redisClientProviders,
    { provide: I_RATE_LIMITER, useClass: RedisRateLimiter },
    { provide: I_ATTEMPT_LOCKOUT, useClass: RedisAttemptLockout },
    { provide: I_PASSWORD_HASHER, useClass: Argon2idHasher },
    TransactionContext,
    { provide: I_TRANSACTION_RUNNER, useClass: TypeOrmTransactionRunner },
    DatabaseRoleCheck,
    QueueMetricsCollector,
  ],
  exports: [
    I_CLOCK,
    REDIS_CLIENT,
    I_RATE_LIMITER,
    I_ATTEMPT_LOCKOUT,
    I_PASSWORD_HASHER,
    I_TRANSACTION_RUNNER,
    TransactionContext,
  ],
})
export class SharedModule {}
