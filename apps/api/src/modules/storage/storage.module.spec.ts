import { getQueueToken } from '@nestjs/bullmq';
import type { DynamicModule, Provider, ValueProvider } from '@nestjs/common';

import { EventEmitterDomainEventPublisher, I_DOMAIN_EVENT_PUBLISHER } from '../../shared';
import { AuditModule } from '../audit';

import { EditableFileGateway } from './application/editable-file.gateway';
import { FILE_SERVICE_CONFIG } from './application/file-service-config';
import { FileVersionService } from './application/file-version.service';
import { FOLDER_CONFIG } from './application/folder-config';
import { FolderService } from './application/folder.service';
import { IndexableFileGateway } from './application/indexable-file.gateway';
import { OptimizableFileGateway } from './application/optimizable-file.gateway';
import { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
import { I_NODE_METADATA_READER } from './application/ports/i-node-metadata-reader.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import { I_QUICK_ACCESS_REPOSITORY } from './application/ports/i-quick-access.repository.port';
import { I_TRASH_PURGE_QUEUE } from './application/ports/i-trash-purge-queue.port';
import { I_VERSION_REPOSITORY } from './application/ports/i-version.repository.port';
import { QUICK_ACCESS_CONFIG } from './application/quick-access-config';
import { QuickAccessService } from './application/quick-access.service';
import { SpaceMeasurer } from './application/space-measurer';
import { SpaceSummaryService } from './application/space-summary.service';
import { TrashPurger } from './application/trash-purger';
import { UPLOAD_CONFIG } from './application/upload-config';
import { VersionHistoryService } from './application/version-history.service';
import { VersionPruner } from './application/version-pruner';
import { VERSION_RESTORE_CONFIG } from './application/version-restore-config';
import { VersionRestoreService } from './application/version-restore.service';
import { WritableAccountPolicy } from './application/writable-account.policy';
import { SqlNodeMetadataReader } from './infrastructure/persistence/sql-node-metadata.reader';
import { TrashPurgeProcessor } from './infrastructure/trash-purge.processor';
import { TRASH_PURGE_QUEUE, TrashPurgeScheduler } from './infrastructure/trash-purge.scheduler';
import { FileVersionsController } from './presentation/file-versions.controller';
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
  RATE_LIMIT_VERSION_RESTORE_PER_MINUTE: 30,
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

  it('CA-17: monta los controladores de cargas, archivos, versiones, carpetas, papelera, accesos rápidos y espacio', () => {
    expect(module.controllers).toEqual([
      UploadsController,
      FilesController,
      FileVersionsController,
      FoldersController,
      TrashController,
      QuickAccessController,
      SpaceController,
    ]);
  });

  it('014 CA-5, CA-13: registra el registro y la poda de versiones con su repositorio', () => {
    expect(providers.map(tokenOf)).toEqual(
      expect.arrayContaining([I_VERSION_REPOSITORY, VersionPruner, FileVersionService]),
    );
  });

  it('014 CA-9: registra la restauración con su límite de tasa del entorno', () => {
    expect(providers).toContain(VersionRestoreService);
    expect(valueOf(providers, VERSION_RESTORE_CONFIG)).toEqual({ restorePerMinute: 30 });
  });

  it('014 CA-6: registra la lectura del historial de versiones', () => {
    expect(providers).toContain(VersionHistoryService);
  });

  it('007 CA-1: registra el resumen de espacio con su medición', () => {
    expect(providers).toEqual(expect.arrayContaining([SpaceMeasurer, SpaceSummaryService]));
  });

  it('011 PD-31: provee el lector de metadatos con su adaptador SQL y exporta su token, el de objetos (009) y las fachadas de edición (016), de indexación (019) y de optimización con la solo lectura (021, PD-121)', () => {
    const reader = providers.find((provider) => tokenOf(provider) === I_NODE_METADATA_READER);

    expect(reader).toEqual({ provide: I_NODE_METADATA_READER, useClass: SqlNodeMetadataReader });
    expect(module.exports).toEqual([
      I_NODE_METADATA_READER,
      I_OBJECT_STORAGE,
      EditableFileGateway,
      IndexableFileGateway,
      OptimizableFileGateway,
      WritableAccountPolicy,
    ]);
  });

  it('019 RN-11: registra el publicador de eventos con que `FileVersionService` anuncia cada versión vigente', () => {
    expect(providers).toContainEqual({
      provide: I_DOMAIN_EVENT_PUBLISHER,
      useClass: EventEmitterDomainEventPublisher,
    });
    expect(providers).toContain(IndexableFileGateway);
  });
});
