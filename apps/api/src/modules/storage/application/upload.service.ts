import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';
import type { InitUploadInput, InitUploadResponse, UploadPartUrl } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import {
  EmptyFileError,
  InvalidUploadRequestError,
  NameConflictError,
  StorageTooManyRequestsError,
} from '../domain/errors';
import { FileName } from '../domain/file-name.vo';
import { expectedPartBytes, planParts } from '../domain/multipart-layout';
import { ObjectKey } from '../domain/object-key';
import { UploadSession } from '../domain/upload-session';
import type { MultipartUpload, UploadMode } from '../domain/upload-session';

import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider, PlanLimits } from './plan-limits';
import { I_FILE_TYPE_DETECTOR } from './ports/i-file-type-detector.port';
import type { IFileTypeDetector } from './ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_UPLOAD_SESSION_REPOSITORY } from './ports/i-upload-session.repository.port';
import type { IUploadSessionRepository } from './ports/i-upload-session.repository.port';
import { QuotaService } from './quota.service';
import type { StorageLogger } from './storage-logger';
import { UPLOAD_CONFIG } from './upload-config';
import type { UploadConfig } from './upload-config';

/** Ventana del límite de inicios de carga por actor (plan D-3); el tope sale de la configuración. */
const RATE_WINDOW_SECONDS = 60;
const INIT_RATE_KEY_PREFIX = 'storage:upload-init:';
const SECOND_MS = 1000;

/** El contrato llama `multipart` a lo que el dominio (y `carga.modo`) llama `por_partes`. */
const CONTRACT_MODE = { simple: 'simple', por_partes: 'multipart' } as const satisfies Record<
  UploadMode,
  string
>;

/** Lo que `init` deja hecho dentro de la transacción: la sesión (la reserva) y la respuesta con sus URLs. */
interface StartedUpload {
  readonly session: UploadSession;
  readonly response: InitUploadResponse;
}

/**
 * Ciclo de vida de una carga (plan §6): iniciar, reanudar, completar, cancelar y vencer. Los bytes no pasan por la
 * API (DF-16): emite URLs prefirmadas tras validar plan, cuota y nombre. Cada método abre `withActor` donde toca
 * filas; las bitácoras solo llevan UUID, tamaños y modos (CA-20).
 */
@Injectable()
export class UploadService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly plans: IPlanLimitsProvider,
    private readonly quota: QuotaService,
    @Inject(I_UPLOAD_SESSION_REPOSITORY) private readonly sessions: IUploadSessionRepository,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_OBJECT_STORAGE) private readonly storage: IObjectStorage,
    @Inject(I_FILE_TYPE_DETECTOR) private readonly detector: IFileTypeDetector,
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /**
   * Inicia una carga (CA-1, CA-2, CA-3, CA-4, CA-6, CA-7, CA-19, CA-23). Orden de plan §6: tasa → nombre → tamaño 0
   * → límites del plan (fuera de la transacción) → en `withActor`: cuota con la fila del actor bloqueada, nombre
   * repetido, modo, multipart, fila `carga` (la reserva) y firmas. Si algo falla tras crear el multipart, lo aborta.
   */
  async init(actor: Actor, request: InitUploadInput): Promise<InitUploadResponse> {
    await this.assertInitRate(actor);
    const name = parseName(request.name);
    const declaredBytes = BigInt(request.sizeBytes);
    if (declaredBytes === 0n) throw new EmptyFileError();
    const limits = await this.plans.limitsFor(actor);
    const keepBoth = request.onConflict === 'keep_both';
    const started = await this.reserve(actor, { name, declaredBytes, keepBoth, limits });
    this.logger.info({
      event: 'upload.initiated',
      cargaId: started.session.id,
      sizeBytes: request.sizeBytes,
      mode: CONTRACT_MODE[started.session.mode],
    });
    return started.response;
  }

  private async assertInitRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(`${INIT_RATE_KEY_PREFIX}${actor.id}`, [
      { limit: this.config.initPerMinute, windowSeconds: RATE_WINDOW_SECONDS },
    ]);
    if (!decision.allowed) throw new StorageTooManyRequestsError(decision.retryAfterSeconds);
  }

  /** La transacción de `init`. Si se creó un multipart y algo falla (incluido el commit), se aborta. */
  private async reserve(actor: Actor, input: ReserveInput): Promise<StartedUpload> {
    const created: { key: string; uploadId: string }[] = [];
    try {
      return await this.transactions.withActor(actor, async () => {
        await this.quota.assertCanUpload(actor, input.declaredBytes, input.limits);
        const plannedName = await this.plannedName(actor, input.name, input.keepBoth);
        const ids = { id: randomUUID(), fileId: randomUUID(), versionId: randomUUID() };
        const key = ObjectKey.of(actor.id, ids.fileId, ids.versionId).value;
        const multipart = await this.openMultipartIfLarge(key, input.declaredBytes);
        if (multipart !== null) created.push({ key, uploadId: multipart.uploadId });
        const session = UploadSession.start({
          ...ids,
          ownerId: actor.id,
          name: input.name,
          keepBoth: input.keepBoth,
          declaredBytes: input.declaredBytes,
          multipart,
          now: this.clock.now(),
        });
        await this.sessions.insert(actor, session);
        return { session, response: await this.initResponse(session, plannedName) };
      });
    } catch (error) {
      await Promise.all(created.map(({ key, uploadId }) => this.abortQuietly(key, uploadId)));
      throw error;
    }
  }

  /** Nombre con el que se guardaría hoy. Con `ask`, un conflicto es 409 con la sugerencia (CA-6, D-4). */
  private async plannedName(actor: Actor, name: FileName, keepBoth: boolean): Promise<FileName> {
    const planned = name.firstFree(await this.nodes.findTakenNames(actor, name));
    if (!keepBoth && !planned.sameAs(name)) throw new NameConflictError(planned.value);
    return planned;
  }

  /** Por partes solo por encima del umbral (estricto): así toda carga por partes tiene al menos 2 (RN-2, D-1). */
  private async openMultipartIfLarge(
    key: string,
    declaredBytes: bigint,
  ): Promise<MultipartUpload | null> {
    if (declaredBytes <= this.config.multipartThresholdBytes) return null;
    const layout = planParts(declaredBytes, this.config.partSizeBytes);
    const uploadId = await this.storage.createMultipart(key);
    return { uploadId, ...layout };
  }

  private async initResponse(
    session: UploadSession,
    plannedName: FileName,
  ): Promise<InitUploadResponse> {
    const base = {
      uploadId: session.id,
      name: plannedName.value,
      expiresAt: session.expiresAt.toISOString(),
    };
    const urlsExpireAt = this.urlsExpireAt();
    const { multipart } = session;
    if (multipart === null) {
      const url = await this.signObject(session);
      return { ...base, mode: 'simple', upload: { url, method: 'PUT', expiresAt: urlsExpireAt } };
    }
    const partNumbers = Array.from({ length: multipart.totalParts }, (_, index) => index + 1);
    return {
      ...base,
      mode: 'multipart',
      partSizeBytes: Number(multipart.partSizeBytes),
      totalParts: multipart.totalParts,
      parts: await this.signParts(session, multipart, partNumbers),
      urlsExpireAt,
    };
  }

  private signObject(session: UploadSession): Promise<string> {
    return this.storage.presignUploadObject({
      key: session.objectKey.value,
      contentLength: session.declaredBytes,
      expiresInSeconds: this.config.urlTtlSeconds,
    });
  }

  /** Una URL por parte, cada una con el `Content-Length` que le toca firmado. */
  private signParts(
    session: UploadSession,
    multipart: MultipartUpload,
    partNumbers: readonly number[],
  ): Promise<UploadPartUrl[]> {
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart({
          key: session.objectKey.value,
          uploadId: multipart.uploadId,
          partNumber,
          contentLength: expectedPartBytes(session.declaredBytes, multipart, partNumber),
          expiresInSeconds: this.config.urlTtlSeconds,
        }),
      })),
    );
  }

  private urlsExpireAt(): string {
    return new Date(
      this.clock.now().getTime() + this.config.urlTtlSeconds * SECOND_MS,
    ).toISOString();
  }

  /** Aborta sin tapar el error original: un fallo aquí se registra (el multipart queda para la limpieza). */
  private async abortQuietly(key: string, uploadId: string): Promise<void> {
    try {
      await this.storage.abortMultipart(key, uploadId);
    } catch {
      this.logger.error({ event: 'upload.abort_failed' });
    }
  }
}

interface ReserveInput {
  readonly name: FileName;
  readonly declaredBytes: bigint;
  readonly keepBoth: boolean;
  readonly limits: PlanLimits;
}

/** El esquema zod ya validó la forma; `FileName` es la regla de dominio (NFC, recorte) y responde el mismo 400. */
function parseName(raw: string): FileName {
  const parsed = FileName.parse(raw);
  if (parsed.ok) return parsed.name;
  throw new InvalidUploadRequestError([
    { field: 'name', reason: parsed.reason, message: STORAGE_FIELD_MESSAGES[parsed.reason] },
  ]);
}
