import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { MINIO_CONFIG } from '../../shared';
import type { Env, MinioConfig } from '../../shared';
import { AuditModule } from '../audit';

import { EditableFileGateway } from './application/editable-file.gateway';
import { EditedVersionRegistrar } from './application/edited-version.registrar';
import { FILE_SERVICE_CONFIG } from './application/file-service-config';
import type { FileServiceConfig } from './application/file-service-config';
import { FileService } from './application/file.service';
import { FOLDER_CONFIG } from './application/folder-config';
import type { FolderConfig } from './application/folder-config';
import { FolderService } from './application/folder.service';
import { IndexableFileGateway } from './application/indexable-file.gateway';
import { I_NODE_METADATA_READER } from './application/ports/i-node-metadata-reader.port';
import { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
import type { IObjectStorage } from './application/ports/i-object-storage.port';
import { I_QUICK_ACCESS_REPOSITORY } from './application/ports/i-quick-access.repository.port';
import { QUICK_ACCESS_CONFIG } from './application/quick-access-config';
import type { QuickAccessConfig } from './application/quick-access-config';
import { QuickAccessService } from './application/quick-access.service';
import { SpaceSummaryService } from './application/space-summary.service';
import { UPLOAD_CONFIG } from './application/upload-config';
import type { UploadConfig } from './application/upload-config';
import { VersionHistoryService } from './application/version-history.service';
import { VERSION_RESTORE_CONFIG } from './application/version-restore-config';
import type { VersionRestoreConfig } from './application/version-restore-config';
import { VersionRestoreService } from './application/version-restore.service';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from './infrastructure/minio-storage.adapter';
import { SqlNodeMetadataReader } from './infrastructure/persistence/sql-node-metadata.reader';
import { TypeOrmQuickAccessRepository } from './infrastructure/persistence/typeorm-quick-access.repository';
import { TRASH_PURGE_QUEUE } from './infrastructure/trash-purge.scheduler';
import { FileVersionsController } from './presentation/file-versions.controller';
import { FilesController } from './presentation/files.controller';
import { FoldersController } from './presentation/folders.controller';
import { QuickAccessController } from './presentation/quick-access.controller';
import { SpaceController } from './presentation/space.controller';
import { TrashController } from './presentation/trash.controller';
import { UploadsController } from './presentation/uploads.controller';
import {
  INDEXABLE_FILE_PROVIDERS,
  SPACE_PROVIDERS,
  TRASH_LIFECYCLE_PROVIDERS,
  UPLOAD_LIFECYCLE_PROVIDERS,
} from './upload-lifecycle.providers';

/** Variables del `api` que `storage` usa (plan §5); las de MinIO internas llegan por `MINIO_CONFIG`. */
export type StorageEnv = Pick<
  Env,
  | 'MINIO_PUBLIC_ENDPOINT'
  | 'UPLOAD_PART_SIZE_BYTES'
  | 'UPLOAD_MULTIPART_THRESHOLD_BYTES'
  | 'UPLOAD_URL_TTL_SECONDS'
  | 'RATE_LIMIT_UPLOAD_INIT_PER_MINUTE'
  | 'RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE'
  | 'RATE_LIMIT_VERSION_RESTORE_PER_MINUTE'
  | 'FOLDER_MAX_DEPTH'
  | 'QUICK_ACCESS_MAX_PINNED'
  | 'QUICK_ACCESS_RECENT_VISIBLE'
>;

/**
 * Módulo `storage` (M2, plan §6): carga, descarga, carpetas, papelera y accesos rápidos (006), resumen de espacio (007) y
 * versiones (014: registro y poda en `UPLOAD_LIFECYCLE_PROVIDERS`; historial, descarga y restauración solo en el `api`)
 * y, desde 016, `EditableFileGateway` (exportado) con el registro de versiones de edición, solo en el `api`; desde 019,
 * `IndexableFileGateway` (exportada) y el anuncio de cada versión vigente (`storage.file-version-created`).
 * `forRoot(env)` publica la configuración técnica (bytes como `bigint`) y une cada puerto con su adaptador. **No**
 * enlaza `I_PLAN_LIMITS_PROVIDER` ni importa `billing`: ese enlace vive en la raíz de composición (DF-51, opción A). `SharedModule` (global) aporta reloj, tasa, transacciones y
 * `TransactionContext`; `MinioConfigModule` (global), `MINIO_CONFIG`. La cola `trash-purge` se registra solo para que
 * «Vaciar papelera» encole: la programa y la procesa el `worker`. Exporta solo `I_NODE_METADATA_READER`, que consume
 * `backoffice` (011, PD-31) importando **este mismo** `DynamicModule` que la raíz (Nest los distingue por referencia).
 */
@Module({})
export class StorageModule {
  static forRoot(env: StorageEnv): DynamicModule {
    const uploadConfig: UploadConfig = {
      partSizeBytes: BigInt(env.UPLOAD_PART_SIZE_BYTES),
      multipartThresholdBytes: BigInt(env.UPLOAD_MULTIPART_THRESHOLD_BYTES),
      urlTtlSeconds: env.UPLOAD_URL_TTL_SECONDS,
      initPerMinute: env.RATE_LIMIT_UPLOAD_INIT_PER_MINUTE,
    };
    const fileServiceConfig: FileServiceConfig = {
      downloadUrlPerMinute: env.RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE,
    };
    const versionRestoreConfig: VersionRestoreConfig = {
      restorePerMinute: env.RATE_LIMIT_VERSION_RESTORE_PER_MINUTE,
    };
    const folderConfig: FolderConfig = { maxDepth: env.FOLDER_MAX_DEPTH };
    const quickAccessConfig: QuickAccessConfig = {
      maxPinned: env.QUICK_ACCESS_MAX_PINNED,
      recentVisible: env.QUICK_ACCESS_RECENT_VISIBLE,
    };
    return {
      module: StorageModule,
      imports: [AuditModule, BullModule.registerQueue({ name: TRASH_PURGE_QUEUE })],
      controllers: [
        UploadsController,
        FilesController,
        FileVersionsController,
        FoldersController,
        TrashController,
        QuickAccessController,
        SpaceController,
      ],
      providers: [
        { provide: UPLOAD_CONFIG, useValue: uploadConfig },
        { provide: FILE_SERVICE_CONFIG, useValue: fileServiceConfig },
        { provide: VERSION_RESTORE_CONFIG, useValue: versionRestoreConfig },
        { provide: FOLDER_CONFIG, useValue: folderConfig },
        { provide: QUICK_ACCESS_CONFIG, useValue: quickAccessConfig },
        { provide: I_QUICK_ACCESS_REPOSITORY, useClass: TypeOrmQuickAccessRepository },
        {
          provide: I_OBJECT_STORAGE,
          inject: [MINIO_CONFIG],
          useFactory: (config: MinioConfig): IObjectStorage =>
            new MinioStorageAdapter(
              buildMinioStorageClients(config, env.MINIO_PUBLIC_ENDPOINT),
              config.MINIO_BUCKET,
            ),
        },
        ...UPLOAD_LIFECYCLE_PROVIDERS,
        ...TRASH_LIFECYCLE_PROVIDERS,
        ...SPACE_PROVIDERS,
        SpaceSummaryService,
        FileService,
        VersionHistoryService,
        VersionRestoreService,
        FolderService,
        QuickAccessService,
        { provide: I_NODE_METADATA_READER, useClass: SqlNodeMetadataReader },
        EditedVersionRegistrar,
        EditableFileGateway,
        ...INDEXABLE_FILE_PROVIDERS,
      ],
      // 011 (PD-31): el lector de metadatos para `backoffice`. 009 (ampliación de la decisión 1, 2026-10-15): `billing`
      // importa `I_OBJECT_STORAGE` de forma explícita, sin módulo global. 016: la fachada de edición para `editing`.
      // 019: la fachada de la indexación para `intelligence`.
      exports: [
        I_NODE_METADATA_READER,
        I_OBJECT_STORAGE,
        EditableFileGateway,
        IndexableFileGateway,
      ],
    };
  }
}
