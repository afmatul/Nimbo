import { getQueueToken } from '@nestjs/bullmq';
import type { DynamicModule, Provider, ValueProvider } from '@nestjs/common';

import { I_DOMAIN_EVENT_PUBLISHER } from '../../shared';
import { AuditModule } from '../audit';

import { FileVersionService } from './application/file-version.service';
import { FOLDER_CONFIG } from './application/folder-config';
import type { FolderConfig } from './application/folder-config';
import { IndexableFileGateway } from './application/indexable-file.gateway';
import { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
import { I_CLIENT_ACCOUNT_SCANNER } from './application/ports/i-client-account.scanner.port';
import { I_EXPIRED_TRASH_SCANNER } from './application/ports/i-expired-trash.scanner.port';
import { I_EXPIRED_UPLOAD_SCANNER } from './application/ports/i-expired-upload.scanner.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import { I_SPACE_REPOSITORY } from './application/ports/i-space.repository.port';
import { I_VERSION_REPOSITORY } from './application/ports/i-version.repository.port';
import { SpaceMeasurer } from './application/space-measurer';
import { TrashService } from './application/trash.service';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import { UploadService } from './application/upload.service';
import { UsageReconciler } from './application/usage-reconciler';
import { VersionPruner } from './application/version-pruner';
import { TrashPurgeProcessor } from './infrastructure/trash-purge.processor';
import {
  TRASH_PURGE_CONFIG,
  TRASH_PURGE_QUEUE,
  TrashPurgeScheduler,
} from './infrastructure/trash-purge.scheduler';
import { UploadCleanupProcessor } from './infrastructure/upload-cleanup.processor';
import {
  UPLOAD_CLEANUP_CONFIG,
  UPLOAD_CLEANUP_QUEUE,
  UploadCleanupScheduler,
} from './infrastructure/upload-cleanup.scheduler';
import { UsageReconcileProcessor } from './infrastructure/usage-reconcile.processor';
import {
  USAGE_RECONCILE_CONFIG,
  USAGE_RECONCILE_QUEUE,
  UsageReconcileScheduler,
} from './infrastructure/usage-reconcile.scheduler';
import { StorageWorkerModule } from './storage-worker.module';

const ENV = {
  UPLOAD_CLEANUP_INTERVAL_MINUTES: 10,
  UPLOAD_CLEANUP_BATCH_SIZE: 100,
  TRASH_PURGE_INTERVAL_MINUTES: 60,
  TRASH_PURGE_BATCH_SIZE: 200,
  USAGE_RECONCILE_INTERVAL_MINUTES: 1440,
  USAGE_RECONCILE_BATCH_SIZE: 300,
};

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

  it('006 CA-19: publica el intervalo y el lote de la purga y registra la cola `trash-purge`, su programa y su procesador', () => {
    expect(valueOf(providers, TRASH_PURGE_CONFIG)).toEqual({ intervalMinutes: 60, batchSize: 200 });
    expect(exportedByImports(module)).toContain(getQueueToken(TRASH_PURGE_QUEUE));
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([
        TrashPurgeScheduler,
        TrashPurgeProcessor,
        I_EXPIRED_TRASH_SCANNER,
        TrashService,
      ]),
    );
  });

  it('007 CA-13: publica el intervalo y el lote de la conciliación y registra la cola `usage-reconcile`, su programa, su procesador y la medición compartida', () => {
    expect(valueOf(providers, USAGE_RECONCILE_CONFIG)).toEqual({
      intervalMinutes: 1440,
      batchSize: 300,
    });
    expect(exportedByImports(module)).toContain(getQueueToken(USAGE_RECONCILE_QUEUE));
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([
        UsageReconcileScheduler,
        UsageReconcileProcessor,
        UsageReconciler,
        I_CLIENT_ACCOUNT_SCANNER,
        I_SPACE_REPOSITORY,
        SpaceMeasurer,
      ]),
    );
  });

  it('014 CA-5, CA-13: registra el registro y la poda de versiones con su repositorio', () => {
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([I_VERSION_REPOSITORY, VersionPruner, FileVersionService]),
    );
  });

  it('006 plan §7: la configuración de carpetas no existe en el `worker`; leerla falla con un mensaje explícito', () => {
    const config = valueOf(providers, FOLDER_CONFIG) as FolderConfig;

    expect(() => config.maxDepth).toThrow(/worker/);
  });

  it('CA-9, 009 decisión 1, 019: es solo de trabajo: sin controladores; exporta `I_OBJECT_STORAGE` (factura PDF) y la fachada de indexación', () => {
    expect(module.controllers ?? []).toEqual([]);
    expect(module.exports ?? []).toEqual([I_OBJECT_STORAGE, IndexableFileGateway]);
  });

  it('019 RN-11: comparte el publicador de eventos de `FileVersionService` con el `api`', () => {
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([I_DOMAIN_EVENT_PUBLISHER, IndexableFileGateway]),
    );
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
