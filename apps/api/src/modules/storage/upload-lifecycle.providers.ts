import type { Provider } from '@nestjs/common';

import { FileVersionService } from './application/file-version.service';
import { I_FILE_TYPE_DETECTOR } from './application/ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './application/ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './application/ports/i-quota.repository.port';
import { I_SPACE_REPOSITORY } from './application/ports/i-space.repository.port';
import { I_TRASH_PURGE_QUEUE } from './application/ports/i-trash-purge-queue.port';
import { I_TRASH_REPOSITORY } from './application/ports/i-trash.repository.port';
import { I_UPLOAD_SESSION_REPOSITORY } from './application/ports/i-upload-session.repository.port';
import { I_VERSION_REPOSITORY } from './application/ports/i-version.repository.port';
import { QuotaService } from './application/quota.service';
import { SpaceMeasurer } from './application/space-measurer';
import { TrashPurger } from './application/trash-purger';
import { TrashService } from './application/trash.service';
import { UploadRegistrar } from './application/upload-registrar';
import { UploadService } from './application/upload.service';
import { VersionPruner } from './application/version-pruner';
import { WritableAccountPolicy } from './application/writable-account.policy';
import { MagicBytesDetector } from './infrastructure/magic-bytes.detector';
import { TypeOrmNodeRepository } from './infrastructure/persistence/typeorm-node.repository';
import { TypeOrmQuotaRepository } from './infrastructure/persistence/typeorm-quota.repository';
import { TypeOrmSpaceRepository } from './infrastructure/persistence/typeorm-space.repository';
import { TypeOrmTrashRepository } from './infrastructure/persistence/typeorm-trash.repository';
import { TypeOrmUploadSessionRepository } from './infrastructure/persistence/typeorm-upload-session.repository';
import { TypeOrmVersionRepository } from './infrastructure/persistence/typeorm-version.repository';
import { TrashPurgeQueue } from './infrastructure/trash-purge.queue';

/**
 * `UploadService` y lo que su constructor pide, salvo `IObjectStorage`, `UPLOAD_CONFIG` e `I_PLAN_LIMITS_PROVIDER`:
 * los comparten `StorageModule` (api) y `StorageWorkerModule` (worker), y cada uno enlaza aquellos tres a su manera.
 * Desde 014 incluye el registro y la poda de versiones (`FileVersionService`, `VersionPruner`), que el reemplazo de
 * `UploadService` usa en ambos procesos.
 */
export const UPLOAD_LIFECYCLE_PROVIDERS: readonly Provider[] = [
  { provide: I_FILE_TYPE_DETECTOR, useClass: MagicBytesDetector },
  { provide: I_NODE_REPOSITORY, useClass: TypeOrmNodeRepository },
  { provide: I_UPLOAD_SESSION_REPOSITORY, useClass: TypeOrmUploadSessionRepository },
  { provide: I_QUOTA_REPOSITORY, useClass: TypeOrmQuotaRepository },
  { provide: I_VERSION_REPOSITORY, useClass: TypeOrmVersionRepository },
  QuotaService,
  VersionPruner,
  FileVersionService,
  UploadRegistrar,
  UploadService,
];

/**
 * `TrashService` y su purga (plan 006 §2): los comparten el `api` («Eliminar definitivamente» y «Vaciar») y el
 * `worker` (purga programada). Quien los usa enlaza `FOLDER_CONFIG` y registra la cola `trash-purge`. Restaurar pide
 * `WritableAccountPolicy` (010 CA-13), que el `api` reutiliza en carpetas y archivos.
 */
export const TRASH_LIFECYCLE_PROVIDERS: readonly Provider[] = [
  { provide: I_TRASH_REPOSITORY, useClass: TypeOrmTrashRepository },
  { provide: I_TRASH_PURGE_QUEUE, useClass: TrashPurgeQueue },
  TrashPurger,
  TrashService,
  WritableAccountPolicy,
];

/**
 * La medición del espacio (plan 007 §2, D-11): la comparten el resumen del `api` y la conciliación del `worker` (DRY).
 * `SpaceMeasurer` pide además `I_TRASH_REPOSITORY`, de `TRASH_LIFECYCLE_PROVIDERS`.
 */
export const SPACE_PROVIDERS: readonly Provider[] = [
  { provide: I_SPACE_REPOSITORY, useClass: TypeOrmSpaceRepository },
  SpaceMeasurer,
];
