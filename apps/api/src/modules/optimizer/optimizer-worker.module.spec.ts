import { Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';

import { OptimizationRunner } from './application/optimization-runner';
import { OptimizationService } from './application/optimization.service';
import { I_INTEGRITY_VALIDATOR } from './application/ports/i-integrity-validator.port';
import { I_OPTIMIZER } from './application/ports/i-optimizer.port';
import { ImageIntegrityValidator } from './infrastructure/image/image-integrity.validator';
import { ImageOptimizer } from './infrastructure/image/image.optimizer';
import { OptimizationProcessor } from './infrastructure/optimization.processor';
import { OptimizerWorkerModule } from './worker';

const WORKER_ENV = {
  OPTIMIZER_TIMEOUT_MS: 100_000,
  OPTIMIZER_MAX_PIXELS: 36_000_000,
  OPTIMIZER_MIN_SAVED_PERCENT: 20,
  OPTIMIZER_MIN_SAVED_BYTES: 1_000_000,
  OPTIMIZER_JPEG_QUALITY: 80,
};
/** Doble de `StorageModule` / `StorageWorkerModule`: solo importa que sea la misma instancia. */
@Module({})
class StorageDoubleModule {}

const STORAGE: DynamicModule = { module: StorageDoubleModule };

const providers = (module: DynamicModule): Provider[] => module.providers ?? [];

describe('OptimizerWorkerModule (plan 021 §2, ADR-0036)', () => {
  it('registra `ImageOptimizer` como `IOptimizer`, el flujo y el procesador, sin el servicio del `api`', () => {
    const module = OptimizerWorkerModule.forRoot(WORKER_ENV, STORAGE);

    expect(providers(module)).toEqual(
      expect.arrayContaining([
        { provide: I_OPTIMIZER, useClass: ImageOptimizer },
        { provide: I_INTEGRITY_VALIDATOR, useClass: ImageIntegrityValidator },
        OptimizationRunner,
        OptimizationProcessor,
      ]),
    );
    expect(providers(module)).not.toContain(OptimizationService);
    expect(module.controllers ?? []).toEqual([]);
  });

  it('usa **la misma** instancia de `storage` que le pasa la raíz del `worker`', () => {
    expect(OptimizerWorkerModule.forRoot(WORKER_ENV, STORAGE).imports).toContain(STORAGE);
  });
});
