import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { errorName, I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import type { File } from '../domain/file';
import { FileVersion } from '../domain/file-version';
import { ObjectKey } from '../domain/object-key';

import { FileVersionService } from './file-version.service';
import type { RegisteredVersion } from './file-version.service';
import { objectByteReader } from './object-byte-reader';
import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider } from './plan-limits';
import { I_FILE_TYPE_DETECTOR } from './ports/i-file-type-detector.port';
import type { IFileTypeDetector } from './ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';
import type { StorageLogger } from './storage-logger';

/** Lo que `optimizer` entrega al terminar una optimización (plan 021 §2, PD-130). */
export interface OptimizedVersionInput {
  readonly fileId: string;
  /** La versión que se optimizó: si ya no es la vigente, el resultado se descarta (CA-11). */
  readonly sourceVersionId: string;
  /** Fijado al confirmar el trabajo: un reintento reutiliza la versión y su clave de objeto (CA-12). */
  readonly versionId: string;
  readonly content: Readable;
  readonly sizeBytes: bigint;
}

/**
 * Resultado del registro. `duplicate`: la versión ya existía (reintento). `file_changed`: la vigente ya no es la de
 * origen. `not_smaller`: el resultado no es menor que la vigente (014b RN-2). `file_missing`: ajeno, en la papelera o
 * purgado. `corrupt`: la firma real no corresponde al tipo del archivo. En ninguno de ellos cambia la versión vigente.
 */
export type OptimizedVersionOutcome =
  | {
      readonly status: 'registered';
      readonly versionId: string;
      readonly versionNumber: number;
      readonly sizeBytes: bigint;
    }
  | { readonly status: 'duplicate'; readonly versionId: string; readonly sizeBytes: bigint }
  | { readonly status: 'file_changed' }
  | { readonly status: 'not_smaller' }
  | { readonly status: 'file_missing' }
  | { readonly status: 'corrupt' };

type Unregistered = Exclude<OptimizedVersionOutcome, { status: 'registered' }>;
type Target = { readonly file: File } | Unregistered;
/** Lo que deja la transacción: la versión registrada con su archivo (para anunciarla y podar) o por qué no se registró. */
type Insertion =
  { readonly status: 'registered'; readonly registered: RegisteredVersion } | Unregistered;

/** Lo que el registro necesita además de la entrada: la clave del objeto y los días que se conserva el original. */
interface Upload {
  readonly input: OptimizedVersionInput;
  readonly objectKey: ObjectKey;
  readonly keepPreviousForDays: number;
}

const registeredOutcome = ({ version }: RegisteredVersion): OptimizedVersionOutcome => ({
  status: 'registered',
  versionId: version.id,
  versionNumber: version.number,
  sizeBytes: version.sizeBytes,
});

/** `duplicate` deja el objeto: es el de la versión ya registrada (misma clave). El resto no tiene versión que lo use. */
const keepsObject = (status: OptimizedVersionOutcome['status']): boolean =>
  status === 'registered' || status === 'duplicate';

/**
 * Registra la versión de una optimización (plan 021 §2, PD-130; ADR-0012) con la única escritura de versiones de
 * `storage` (`FileVersionService`), como `EditedVersionRegistrar` (016). Los días de conservación del original salen de
 * `PlanLimits.trashRetentionDays` fuera de la transacción (014b RN-3). Revalida antes de subir y otra vez bajo
 * `lockUsage`: archivo propio y vivo, versión nueva, la de origen todavía vigente y el resultado estrictamente menor,
 * así que `register` nunca recibe una optimización que 014b rechazaría como invariante. No valida cuota (014b CA-2) ni
 * solo lectura (se decidió al confirmar, plan 021 §5). Si no registra, borra lo subido (Art. XI).
 */
@Injectable()
export class OptimizedVersionRegistrar {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_FILE_TYPE_DETECTOR) private readonly detector: IFileTypeDetector,
    @Inject(FileVersionService) private readonly fileVersions: FileVersionService,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async register(actor: Actor, input: OptimizedVersionInput): Promise<OptimizedVersionOutcome> {
    const { trashRetentionDays } = await this.planLimits.limitsFor(actor);
    const target = await this.transactions.withActor(actor, () => this.resolve(actor, input));
    if (!('file' in target)) return target;
    const objectKey = ObjectKey.of(target.file.ownerId, target.file.id, input.versionId);
    await this.objects.putObjectStream(objectKey.value, input.content, input.sizeBytes);
    const upload = { input, objectKey, keepPreviousForDays: trashRetentionDays };
    const insertion = await this.registerUploaded(actor, upload, target.file);
    if (insertion.status !== 'registered') return insertion;
    await this.fileVersions.afterCommit(actor, insertion.registered);
    return registeredOutcome(insertion.registered);
  }

  /** La versión ya existente gana a todo (reintento); después, archivo propio y vivo, origen vigente y menor. */
  private async resolve(actor: Actor, input: OptimizedVersionInput): Promise<Target> {
    const existing = await this.versions.find(actor, input.fileId, input.versionId);
    if (existing !== null)
      return { status: 'duplicate', versionId: existing.id, sizeBytes: existing.sizeBytes };
    const file = await this.nodes.findAccessibleById(actor, input.fileId);
    if (file?.ownerId !== actor.id) return { status: 'file_missing' };
    if (file.currentVersionId !== input.sourceVersionId) return { status: 'file_changed' };
    if (input.sizeBytes >= file.sizeBytes) return { status: 'not_smaller' };
    return { file };
  }

  private async registerUploaded(actor: Actor, upload: Upload, file: File): Promise<Insertion> {
    let insertion: Insertion;
    try {
      insertion = (await this.matchesKind(file, upload.objectKey, upload.input.sizeBytes))
        ? await this.transactions.withActor(actor, () => this.insert(actor, upload))
        : { status: 'corrupt' };
    } catch (error) {
      await this.discardCandidate(upload);
      throw error;
    }
    if (!keepsObject(insertion.status)) await this.objects.purgeObject(upload.objectKey.value);
    return insertion;
  }

  /** Como la restauración: registra una compensación fallida sin tapar el error original ni exponer la clave. */
  private async discardCandidate({ input, objectKey }: Upload): Promise<void> {
    try {
      await this.objects.purgeObject(objectKey.value);
    } catch (error) {
      this.logger.error({
        event: 'version.optimization_discard_failed',
        fileId: input.fileId,
        versionId: input.versionId,
        errorName: errorName(error),
      });
    }
  }

  /** `lockUsage` primero: con el propietario serializado, revalidar no tiene carreras con otro registro. */
  private async insert(actor: Actor, upload: Upload): Promise<Insertion> {
    await this.quotas.lockUsage(actor);
    const target = await this.resolve(actor, upload.input);
    if (!('file' in target)) return target;
    const registered = await this.fileVersions.register(actor, {
      file: target.file,
      buildVersion: this.versionBuilder(actor, upload),
      keepPreviousForDays: upload.keepPreviousForDays,
    });
    return { status: 'registered', registered };
  }

  private versionBuilder(actor: Actor, { input, objectKey }: Upload) {
    const now = this.clock.now();
    return (number: number): FileVersion =>
      FileVersion.forOrigin('optimizacion', {
        id: input.versionId,
        fileId: input.fileId,
        objectKey,
        sizeBytes: input.sizeBytes,
        createdBy: actor.id,
        number,
        now,
      });
  }

  /** La firma real del resultado es la de la extensión del archivo y del mismo tipo (RN-6: sin conversión). */
  private async matchesKind(file: File, key: ObjectKey, sizeBytes: bigint): Promise<boolean> {
    const reader = objectByteReader(this.objects, key.value, sizeBytes);
    const result = await this.detector.detect(reader, file.name.extension());
    return result.ok && result.kind === file.kind;
  }
}
