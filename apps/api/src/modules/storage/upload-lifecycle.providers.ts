import type { Provider } from '@nestjs/common';

import { EventEmitterDomainEventPublisher, I_DOMAIN_EVENT_PUBLISHER } from '../../shared';

import { FileVersionService } from './application/file-version.service';
import { IndexableFileGateway } from './application/indexable-file.gateway';
import { OptimizableFileGateway } from './application/optimizable-file.gateway';
import { OptimizedVersionRegistrar } from './application/optimized-version.registrar';
import { I_CLIENT_ACCOUNT_SCANNER } from './application/ports/i-client-account.scanner.port';
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
import { SqlClientAccountScanner } from './infrastructure/persistence/sql-client-account.scanner';
import { TypeOrmNodeRepository } from './infrastructure/persistence/typeorm-node.repository';
import { TypeOrmQuotaRepository } from './infrastructure/persistence/typeorm-quota.repository';
import { TypeOrmSpaceRepository } from './infrastructure/persistence/typeorm-space.repository';
import { TypeOrmTrashRepository } from './infrastructure/persistence/typeorm-trash.repository';
import { TypeOrmUploadSessionRepository } from './infrastructure/persistence/typeorm-upload-session.repository';
import { TypeOrmVersionRepository } from './infrastructure/persistence/typeorm-version.repository';
import { TrashPurgeQueue } from './infrastructure/trash-purge.queue';

/**
 * La única escritura de versiones (014, 014b): `FileVersionService` registra y `VersionPruner` poda, con sus repositorios,
 * el detector de tipo real y, desde 019, el publicador con que se anuncia cada versión vigente (RN-11, ADR-0019; la raíz
 * de cada proceso carga `EventEmitterModule.forRoot()`). Piden además `IObjectStorage` e `I_PLAN_LIMITS_PROVIDER`, que
 * enlaza cada proceso. Es todo lo que el registro de una optimización necesita de `storage` (021, ADR-0037).
 */
export const FILE_VERSION_PROVIDERS: readonly Provider[] = [
  { provide: I_DOMAIN_EVENT_PUBLISHER, useClass: EventEmitterDomainEventPublisher },
  { provide: I_FILE_TYPE_DETECTOR, useClass: MagicBytesDetector },
  { provide: I_NODE_REPOSITORY, useClass: TypeOrmNodeRepository },
  { provide: I_QUOTA_REPOSITORY, useClass: TypeOrmQuotaRepository },
  { provide: I_VERSION_REPOSITORY, useClass: TypeOrmVersionRepository },
  VersionPruner,
  FileVersionService,
];

/**
 * `UploadService` y lo que su constructor pide, salvo `IObjectStorage`, `UPLOAD_CONFIG` e `I_PLAN_LIMITS_PROVIDER`:
 * los comparten `StorageModule` (api) y `StorageWorkerModule` (worker), y cada uno enlaza aquellos tres a su manera.
 * Incluye la escritura de versiones (`FILE_VERSION_PROVIDERS`), que el reemplazo de `UploadService` usa en ambos procesos.
 */
export const UPLOAD_LIFECYCLE_PROVIDERS: readonly Provider[] = [
  ...FILE_VERSION_PROVIDERS,
  { provide: I_UPLOAD_SESSION_REPOSITORY, useClass: TypeOrmUploadSessionRepository },
  QuotaService,
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

/**
 * `IndexableFileGateway` (019 plan §2), exportada por `StorageModule` (estado y reintento en el `api`) y por
 * `StorageWorkerModule` (indexación y conciliación en el `worker`). Pide además `I_OBJECT_STORAGE` y los repositorios
 * de `UPLOAD_LIFECYCLE_PROVIDERS`; el escáner de cuentas lo comparten `clientIds` y la conciliación de espacio (007).
 */
export const INDEXABLE_FILE_PROVIDERS: readonly Provider[] = [
  { provide: I_CLIENT_ACCOUNT_SCANNER, useClass: SqlClientAccountScanner },
  IndexableFileGateway,
];

/**
 * `OptimizableFileGateway` y su registrador (plan 021 §2, PD-130), exportados por `StorageModule` (estimar y ejecutar en
 * el `api`) y por `StorageFacadesWorkerModule` (leer y registrar en el `worker-optimizer`, ADR-0037). Piden
 * `I_OBJECT_STORAGE`, `I_PLAN_LIMITS_PROVIDER` (enlazado en la raíz) y `FILE_VERSION_PROVIDERS`.
 */
export const OPTIMIZABLE_FILE_PROVIDERS: readonly Provider[] = [
  OptimizedVersionRegistrar,
  OptimizableFileGateway,
];
