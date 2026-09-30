import { getQueueToken } from '@nestjs/bullmq';
import type { DynamicModule, Provider, ValueProvider } from '@nestjs/common';

import { AuditModule } from '../audit';

import { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
import { I_EXPIRED_UPLOAD_SCANNER } from './application/ports/i-expired-upload.scanner.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import { UploadService } from './application/upload.service';
import { UploadCleanupProcessor } from './infrastructure/upload-cleanup.processor';
import {
  UPLOAD_CLEANUP_CONFIG,
  UPLOAD_CLEANUP_QUEUE,
  UploadCleanupScheduler,
} from './infrastructure/upload-cleanup.scheduler';
import { StorageWorkerModule } from './storage-worker.module';

const ENV = { UPLOAD_CLEANUP_INTERVAL_MINUTES: 10, UPLOAD_CLEANUP_BATCH_SIZE: 100 };

const tokenOf = (provider: Provider): unknown =>
  typeof provider === 'function' ? provider : provider.provide;

function valueOf(providers: readonly Provider[], token: symbol): unknown {
  const found = providers.find((provider) => tokenOf(provider) === token) as
    ValueProvider | undefined;
  return found?.useValue;
}

/** Tokens que exporta cada módulo importado (p. ej. la cola que registra `BullModule.registerQueue`). */
const exportedByImports = (module: DynamicModule): unknown[] =>
  (module.imports ?? []).flatMap((imported) =>
    'exports' in imported
      ? (imported.exports ?? []).map((exported) => tokenOf(exported as Provider))
      : [],
  );

describe('StorageWorkerModule', () => {
  const module = StorageWorkerModule.forRoot(ENV);
  const providers = module.providers ?? [];

  it('CA-9: publica el intervalo y el lote del barrido tomados del entorno del `worker`', () => {
    expect(valueOf(providers, UPLOAD_CLEANUP_CONFIG)).toEqual({
      intervalMinutes: 10,
      batchSize: 100,
    });
  });

  it('CA-9: registra la cola `upload-cleanup`, el programa, el procesador, el escáner y `UploadService`', () => {
    expect(exportedByImports(module)).toContain(getQueueToken(UPLOAD_CLEANUP_QUEUE));
    expect(module.imports).toContain(AuditModule);
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([
        UploadCleanupScheduler,
        UploadCleanupProcessor,
        I_EXPIRED_UPLOAD_SCANNER,
        I_OBJECT_STORAGE,
        UploadService,
      ]),
    );
  });

  it('CA-9: es solo de trabajo: sin controladores y sin exportar nada', () => {
    expect(module.controllers ?? []).toEqual([]);
    expect(module.exports ?? []).toEqual([]);
  });

  it('RN-1, DF-51: no enlaza `I_PLAN_LIMITS_PROVIDER` (lo hace la raíz de composición del `worker`)', () => {
    expect(providers.map(tokenOf)).not.toContain(I_PLAN_LIMITS_PROVIDER);
  });

  it('plan §5: la configuración de carga no existe en el `worker`; leerla falla con un mensaje explícito', () => {
    const config = valueOf(providers, UPLOAD_CONFIG) as UploadConfig;

    expect(() => config.partSizeBytes).toThrow(/worker/);
    expect(() => config.multipartThresholdBytes).toThrow(/worker/);
    expect(() => config.urlTtlSeconds).toThrow(/worker/);
    expect(() => config.initPerMinute).toThrow(/worker/);
  });
});
