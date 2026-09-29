import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';

import type { ITransactionRunner } from './application/persistence/i-transaction-runner.port';
import type { IRateLimiter } from './application/rate-limit/i-rate-limiter.port';
import type { IClock } from './domain/i-clock.port';
import { DatabaseRoleCheck } from './infrastructure/persistence/database-role.check';

import {
  EnvModule,
  I_CLOCK,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  REDIS_CLIENT,
  SharedModule,
  SystemClock,
  TransactionContext,
} from './index';

const ENV_VALUE = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_VERSION: 'test',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: 'postgres://nimbo:nimbo@127.0.0.1:1/nimbo',
  REDIS_URL: 'redis://127.0.0.1:1',
} as const;

/** Consumidor de un módulo de negocio: no importa `SharedModule`, solo inyecta sus puertos. */
@Injectable()
class PortsConsumer {
  constructor(
    @Inject(I_CLOCK) readonly clock: IClock,
    @Inject(I_RATE_LIMITER) readonly rateLimiter: IRateLimiter,
    @Inject(I_TRANSACTION_RUNNER) readonly transactionRunner: ITransactionRunner,
    @Inject(REDIS_CLIENT) readonly redis: Redis,
    readonly transactionContext: TransactionContext,
  ) {}
}

@Module({ providers: [PortsConsumer] })
class BusinessModule {}

describe('SharedModule global (001 plan §6.7)', () => {
  it('CA-1/CA-15: un módulo que no importa `SharedModule` resuelve sus puertos', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule.forRoot(ENV_VALUE), SharedModule, BusinessModule],
    })
      // Sin Postgres en las unitarias: la conexión real la cubren las pruebas de integración.
      .overrideProvider(DataSource)
      .useValue({ manager: {}, transaction: jest.fn(), destroy: jest.fn() })
      .compile();

    const consumer = moduleRef.get(PortsConsumer);

    expect(consumer.clock).toBeInstanceOf(SystemClock);
    expect(typeof consumer.rateLimiter.consume).toBe('function');
    expect(typeof consumer.transactionRunner.run).toBe('function');
    expect(consumer.redis.status).toBe('wait');
    expect(consumer.transactionContext).toBeInstanceOf(TransactionContext);
    await moduleRef.close();
  });
});

describe('SharedModule y el rol de base de datos (003 plan §6.4)', () => {
  it('CA-13: registra `DatabaseRoleCheck`, que corre al arrancar `api` y `worker`', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule.forRoot(ENV_VALUE), SharedModule],
    })
      .overrideProvider(DataSource)
      .useValue({ manager: {}, transaction: jest.fn(), destroy: jest.fn() })
      .compile();

    expect(moduleRef.get(DatabaseRoleCheck)).toBeInstanceOf(DatabaseRoleCheck);
    await moduleRef.close();
  });
});
