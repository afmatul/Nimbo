import type { Provider } from '@nestjs/common';

import { I_FILE_TYPE_DETECTOR } from './application/ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './application/ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './application/ports/i-quota.repository.port';
import { I_UPLOAD_SESSION_REPOSITORY } from './application/ports/i-upload-session.repository.port';
import { QuotaService } from './application/quota.service';
import { UploadRegistrar } from './application/upload-registrar';
import { UploadService } from './application/upload.service';
import { MagicBytesDetector } from './infrastructure/magic-bytes.detector';
import { TypeOrmNodeRepository } from './infrastructure/persistence/typeorm-node.repository';
import { TypeOrmQuotaRepository } from './infrastructure/persistence/typeorm-quota.repository';
import { TypeOrmUploadSessionRepository } from './infrastructure/persistence/typeorm-upload-session.repository';

/**
 * `UploadService` y lo que su constructor pide, salvo `IObjectStorage`, `UPLOAD_CONFIG` e `I_PLAN_LIMITS_PROVIDER`:
 * los comparten `StorageModule` (api) y `StorageWorkerModule` (worker), y cada uno enlaza aquellos tres a su manera.
 */
export const UPLOAD_LIFECYCLE_PROVIDERS: readonly Provider[] = [
  { provide: I_FILE_TYPE_DETECTOR, useClass: MagicBytesDetector },
  { provide: I_NODE_REPOSITORY, useClass: TypeOrmNodeRepository },
  { provide: I_UPLOAD_SESSION_REPOSITORY, useClass: TypeOrmUploadSessionRepository },
  { provide: I_QUOTA_REPOSITORY, useClass: TypeOrmQuotaRepository },
  QuotaService,
  UploadRegistrar,
  UploadService,
];
