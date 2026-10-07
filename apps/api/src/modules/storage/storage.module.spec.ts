import { getQueueToken } from '@nestjs/bullmq';
import type { DynamicModule, Provider, ValueProvider } from '@nestjs/common';

import { AuditModule } from '../audit';

import { AccessibleFileUrlIssuer } from './application/accessible-file-url-issuer';
import { FILE_SERVICE_CONFIG } from './application/file-service-config';
import { FOLDER_CONFIG } from './application/folder-config';
import { FolderService } from './application/folder.service';
import { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
import { I_QUICK_ACCESS_REPOSITORY } from './application/ports/i-quick-access.repository.port';
import { I_TRASH_PURGE_QUEUE } from './application/ports/i-trash-purge-queue.port';
import { QUICK_ACCESS_CONFIG } from './application/quick-access-config';
import { QuickAccessService } from './application/quick-access.service';
import { SpaceMeasurer } from './application/space-measurer';
import { SpaceSummaryService } from './application/space-summary.service';
import { StoragePreviewFacade } from './application/storage-preview.facade';
import { TrashPurger } from './application/trash-purger';
import { UPLOAD_CONFIG } from './application/upload-config';
import { TrashPurgeProcessor } from './infrastructure/trash-purge.processor';
import { TRASH_PURGE_QUEUE, TrashPurgeScheduler } from './infrastructure/trash-purge.scheduler';
import { FilesController } from './presentation/files.controller';
import { FoldersController } from './presentation/folders.controller';
import { QuickAccessController } from './presentation/quick-access.controller';
import { SpaceController } from './presentation/space.controller';
import { TrashController } from './presentation/trash.controller';
import { UploadsController } from './presentation/uploads.controller';
import { StorageModule } from './storage.module';

const ENV = {
  MINIO_PUBLIC_ENDPOINT: 'http://localhost:9000',
  UPLOAD_PART_SIZE_BYTES: 8_388_608,
  UPLOAD_MULTIPART_THRESHOLD_BYTES: 16_777_216,
  UPLOAD_URL_TTL_SECONDS: 3600,
  RATE_LIMIT_UPLOAD_INIT_PER_MINUTE: 300,
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: 120,
  FOLDER_MAX_DEPTH: 7,
  QUICK_ACCESS_MAX_PINNED: 4,
  QUICK_ACCESS_RECENT_VISIBLE: 2,
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

describe('StorageModule', () => {
  const module = StorageModule.forRoot(ENV);
  const providers = module.providers ?? [];

  it('CA-2: publica la configuración de carga del entorno con los bytes como `bigint`', () => {
    expect(valueOf(providers, UPLOAD_CONFIG)).toEqual({
      partSizeBytes: 8_388_608n,
      multipartThresholdBytes: 16_777_216n,
      urlTtlSeconds: 3600,
      initPerMinute: 300,
    });
    expect(valueOf(providers, FILE_SERVICE_CONFIG)).toEqual({ downloadUrlPerMinute: 120 });
  });

  it('006 CA-9: publica la profundidad máxima de carpetas del entorno y registra `FolderService`', () => {
    expect(valueOf(providers, FOLDER_CONFIG)).toEqual({ maxDepth: 7 });
    expect(providers).toContain(FolderService);
  });

  it('006 CA-27, CA-28: publica la configuración de accesos rápidos del entorno y registra su servicio', () => {
    expect(valueOf(providers, QUICK_ACCESS_CONFIG)).toEqual({ maxPinned: 4, recentVisible: 2 });
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([I_QUICK_ACCESS_REPOSITORY, QuickAccessService]),
    );
  });

  it('RN-1: no enlaza `I_PLAN_LIMITS_PROVIDER` (lo hace la raíz de composición) e importa la auditoría', () => {
    expect(providers.map(tokenOf)).not.toContain(I_PLAN_LIMITS_PROVIDER);
    expect(module.imports).toContain(AuditModule);
  });

  it('006 CA-18: registra la cola `trash-purge` solo para encolar «Vaciar»; no programa ni procesa', () => {
    expect(exportedByImports(module)).toContain(getQueueToken(TRASH_PURGE_QUEUE));
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([I_TRASH_PURGE_QUEUE, TrashPurger]),
    );
    expect(providers.map(tokenOf)).not.toContain(TrashPurgeScheduler);
    expect(providers.map(tokenOf)).not.toContain(TrashPurgeProcessor);
  });

  it('CA-17: monta los controladores de cargas, archivos, carpetas, papelera, accesos rápidos y espacio', () => {
    expect(module.controllers).toEqual([
      UploadsController,
      FilesController,
      FoldersController,
      TrashController,
      QuickAccessController,
      SpaceController,
    ]);
  });

  it('007 CA-1: registra el resumen de espacio con su medición', () => {
    expect(providers).toEqual(expect.arrayContaining([SpaceMeasurer, SpaceSummaryService]));
  });

  it('017 CA-11: registra el emisor compartido y exporta solo la fachada de vista previa', () => {
    expect(providers).toEqual(
      expect.arrayContaining([AccessibleFileUrlIssuer, StoragePreviewFacade]),
    );
    expect(module.exports).toEqual([StoragePreviewFacade]);
  });
});
