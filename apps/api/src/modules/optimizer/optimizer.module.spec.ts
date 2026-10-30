import { Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';

import { AppModule } from '../../app.module';

import { OptimizationRunner } from './application/optimization-runner';
import { OptimizationService } from './application/optimization.service';
import { I_JOB_QUEUE } from './application/ports/i-job-queue.port';
import { I_OPTIMIZER } from './application/ports/i-optimizer.port';
import { OptimizationProcessor } from './infrastructure/optimization.processor';

import { OptimizerModule } from '.';

// ADR-0037: si algo del `api` (su raíz o el barril de `optimizer`) requiriera `sharp`, esta suite no cargaría.
jest.mock('sharp', () => {
  throw new Error('El `api` no carga `sharp`.');
});

const API_ENV = {
  OPTIMIZER_MAX_FILE_BYTES: 40_000_000,
  OPTIMIZER_MAX_ATTEMPTS: 3,
  OPTIMIZER_TIMEOUT_MS: 100_000,
  OPTIMIZER_POLL_INTERVAL_MS: 3000,
  RATE_LIMIT_OPTIMIZER_PER_MINUTE: 10,
};
/** Doble de `StorageModule` / `StorageWorkerModule`: solo importa que sea la misma instancia. */
@Module({})
class StorageDoubleModule {}

const STORAGE: DynamicModule = { module: StorageDoubleModule };

const tokensOf = (module: DynamicModule): unknown[] =>
  (module.providers ?? []).map((provider: Provider) =>
    typeof provider === 'function' ? provider : provider.provide,
  );

describe('módulos de `optimizer` (plan 021 §2, ADR-0037)', () => {
  it('el `api` calcula y consulta y encola en `optimization`, sin optimizador, flujo ni procesador', () => {
    const tokens = tokensOf(OptimizerModule.forRoot(API_ENV, { storage: STORAGE }));

    expect(tokens).toEqual(expect.arrayContaining([OptimizationService, I_JOB_QUEUE]));
    expect(tokens).not.toContain(I_OPTIMIZER);
    expect(tokens).not.toContain(OptimizationRunner);
    expect(tokens).not.toContain(OptimizationProcessor);
  });

  it('la raíz del `api` se carga sin `sharp`', () => {
    expect(AppModule).toBeDefined();
  });
});
