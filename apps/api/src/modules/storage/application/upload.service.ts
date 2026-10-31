import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { formatBytes, STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';
import type {
  CompleteUploadResponse,
  InitUploadInput,
  InitUploadResponse,
  ResumeUploadResponse,
  UploadOnConflict,
  UploadPartUrl,
} from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import {
  EmptyFileError,
  FileTooLargeError,
  InvalidFileTypeError,
  InvalidUploadRequestError,
  NodeNotFoundError,
  UploadExpiredError,
  UploadIncompleteError,
  UploadNotFoundError,
  UploadSizeMismatchError,
} from '../domain/errors';
import type { FileKind } from '../domain/file-kind';
import { FileName } from '../domain/file-name.vo';
import { expectedPartBytes, planParts } from '../domain/multipart-layout';
import { ObjectKey } from '../domain/object-key';
import { UploadSession } from '../domain/upload-session';
import type { MultipartUpload, UploadMode, UploadRejectionReason } from '../domain/upload-session';
import { assessObjectSize, assessParts } from '../domain/uploaded-size';
import type { SizeVerdict } from '../domain/uploaded-size';

import { toFileSummary } from './file-summary';
import { objectByteReader } from './object-byte-reader';
import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider, PlanLimits } from './plan-limits';
import { I_FILE_TYPE_DETECTOR } from './ports/i-file-type-detector.port';
import type {
  DetectionResult,
  IFileTypeDetector,
} from './ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_UPLOAD_SESSION_REPOSITORY } from './ports/i-upload-session.repository.port';
import type { IUploadSessionRepository } from './ports/i-upload-session.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';
import { QuotaService } from './quota.service';
import { recordAudit } from './record-audit';
import { rateLimited } from './storage-logger';
import type { StorageLogger } from './storage-logger';
import { UPLOAD_CONFIG } from './upload-config';
import type { UploadConfig } from './upload-config';
import { UploadRegistrar } from './upload-registrar';
import type { Registration, VerifiedUpload } from './upload-registrar';
import { resolveUploadTarget } from './upload-target';
import type { UploadTarget } from './upload-target';
import { assertWritableLimits } from './writable-account.policy';

/** Ventana del límite de inicios de carga por actor (plan D-3); el tope sale de la configuración. */
const RATE_WINDOW_SECONDS = 60;
const INIT_RATE_KEY_PREFIX = 'storage:upload-init:';
const SECOND_MS = 1000;
/** Intentos de borrar lo subido al cancelar o vencer (plan §6, Art. XI). */
const DISCARD_ATTEMPTS = 3;

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

/** Lo que `complete` registró: el archivo y su versión nueva. */
type Registered = Extract<Registration, { outcome: 'registered' }>;

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
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_OBJECT_STORAGE) private readonly storage: IObjectStorage,
    @Inject(I_FILE_TYPE_DETECTOR) private readonly detector: IFileTypeDetector,
    private readonly registrar: UploadRegistrar,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /**
   * Inicia una carga (CA-1, CA-2, CA-3, CA-4, CA-6, CA-7, CA-19, CA-23). Orden de plan §6: tasa → nombre → tamaño 0
   * → límites del plan (fuera de la transacción) → en `withActor`: cuota con la fila del actor bloqueada, carpeta
   * destino viva (006 CA-6), nombre repetido en ella (o el archivo que reemplaza, 014 CA-1), modo, multipart, fila
   * `carga` (la reserva) y firmas. Si algo falla tras crear el multipart, lo aborta.
   */
  async init(actor: Actor, request: InitUploadInput): Promise<InitUploadResponse> {
    await this.assertInitRate(actor);
    const name = parseName(request.name);
    const declaredBytes = BigInt(request.sizeBytes);
    if (declaredBytes === 0n) throw new EmptyFileError();
    const limits = await this.plans.limitsFor(actor);
    assertWritableLimits(limits);
    const started = await this.reserve(actor, {
      name,
      folderId: request.folderId,
      declaredBytes,
      onConflict: request.onConflict,
      limits,
    });
    this.logger.info({
      event: 'upload.initiated',
      cargaId: started.session.id,
      sizeBytes: request.sizeBytes,
      mode: CONTRACT_MODE[started.session.mode],
    });
    return started.response;
  }

  /**
   * Reanuda una carga activa (CA-8): por partes, las partes ya recibidas (según `listParts`) y URLs nuevas solo de
   * las que faltan; simple, una URL nueva (se sube de nuevo entera). Vencida ⇒ `expire` y 410 (CA-9).
   */
  async resume(actor: Actor, uploadId: string): Promise<ResumeUploadResponse> {
    const session = await this.requireActive(actor, await this.findOwned(actor, uploadId));
    const response = await this.resumeResponse(session);
    this.logger.info({ event: 'upload.resumed', cargaId: session.id });
    return response;
  }

  /**
   * Completa una carga (CA-5, CA-10, CA-11, CA-12, CA-24), fuera de transacción hasta el registro final (plan §6):
   * ya `completada` ⇒ el mismo archivo (idempotente); vencida ⇒ 410; por partes, `listParts` es la fuente de
   * verdad (no los ETags del cliente) y un multipart ya cerrado se recupera con `headObject`; después, tamaño real
   * contra el plan y lo declarado, y tipo real con el detector. Un fallo de tamaño o tipo rechaza la carga y borra
   * lo subido.
   */
  async complete(actor: Actor, uploadId: string): Promise<CompleteUploadResponse> {
    const found = await this.findOwned(actor, uploadId);
    if (found?.state === 'completada') return this.completedFile(actor, found);
    const session = await this.requireActive(actor, found);
    const limits = await this.plans.limitsFor(actor);
    assertWritableLimits(limits);
    const sizeBytes = await this.assembleObject(actor, session, limits.maxFileBytes);
    const kind = await this.verifyType(actor, session, sizeBytes);
    if (kind === null) return this.afterLostRegistration(actor, session.id);
    return this.register(actor, session, { sizeBytes, kind });
  }

  /**
   * Cancela una carga activa (CA-22): CAS `activa → cancelada` primero (libera la reserva y `complete` ya no puede
   * ganar) y borrar después. Ajena, inexistente o ya cerrada (también si el CAS pierde contra `complete`) ⇒ 404.
   */
  async cancel(actor: Actor, uploadId: string): Promise<void> {
    const session = await this.transactions.withActor(actor, async () => {
      const found = await this.sessions.findOwned(actor, uploadId);
      if (found?.state !== 'activa') throw new UploadNotFoundError();
      if (!(await this.close(actor, found, 'cancelada'))) throw new UploadNotFoundError();
      return found;
    });
    await this.discardObject(session);
    this.logger.info({ event: 'upload.cancelled', cargaId: session.id });
  }

  /**
   * Vence una carga activa pasada de 24 h (CA-9): CAS `activa → expirada` y borrar después. Idempotente: si no
   * existe para el actor, ya no está activa o todavía no vence, no hace nada. Lo usan `resume`, `complete` y la
   * limpieza periódica.
   */
  async expire(actor: Actor, uploadId: string): Promise<void> {
    const now = this.clock.now();
    const session = await this.transactions.withActor(actor, async () => {
      const found = await this.sessions.findOwned(actor, uploadId);
      if (found?.state !== 'activa' || !found.isExpired(now)) return null;
      return (await this.close(actor, found, 'expirada')) ? found : null;
    });
    if (session === null) return;
    await this.discardObject(session);
    this.logger.info({ event: 'upload.expired', cargaId: session.id });
  }

  private async assertInitRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(`${INIT_RATE_KEY_PREFIX}${actor.id}`, [
      { limit: this.config.initPerMinute, windowSeconds: RATE_WINDOW_SECONDS },
    ]);
    if (!decision.allowed) {
      throw rateLimited(this.logger, 'upload_init', decision.retryAfterSeconds);
    }
  }

  /** La transacción de `init`. Si se creó un multipart y algo falla (incluido el commit), se aborta. */
  private async reserve(actor: Actor, input: ReserveInput): Promise<StartedUpload> {
    const created: { key: string; uploadId: string }[] = [];
    try {
      return await this.transactions.withActor(actor, async () => {
        await this.quota.assertCanUpload(actor, input.declaredBytes, input.limits);
        await this.assertDestinationOwned(actor, input.folderId);
        const target = await resolveUploadTarget(
          { nodes: this.nodes, versions: this.versions },
          actor,
          {
            ...input,
            retainedVersions: input.limits.retainedVersions,
          },
        );
        const ids = newIds(target);
        const key = ObjectKey.of(actor.id, ids.fileId, ids.versionId).value;
        const multipart = await this.openMultipartIfLarge(key, input.declaredBytes);
        if (multipart !== null) created.push({ key, uploadId: multipart.uploadId });
        const fields = sessionFields(actor, input, target);
        const session = UploadSession.start({
          ...ids,
          ...fields,
          multipart,
          now: this.clock.now(),
        });
        await this.sessions.insert(actor, session);
        return { session, response: await this.initResponse(session, target.name) };
      });
    } catch (error) {
      await Promise.all(created.map(({ key, uploadId }) => this.abortQuietly(key, uploadId)));
      throw error;
    }
  }

  /** 006 CA-6: la carpeta destino debe estar viva y ser del actor (no basta compartida, 012 CA-14); `null` es la raíz. */
  private async assertDestinationOwned(actor: Actor, folderId: string | null): Promise<void> {
    if (folderId === null) return;
    if ((await this.nodes.findOwnedFolder(actor, folderId)) === null) {
      throw new NodeNotFoundError();
    }
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
    return {
      ...base,
      mode: 'multipart',
      partSizeBytes: Number(multipart.partSizeBytes),
      totalParts: multipart.totalParts,
      parts: await this.signParts(session, multipart, partNumbersOf(multipart)),
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

  private async completedFile(
    actor: Actor,
    session: UploadSession,
  ): Promise<CompleteUploadResponse> {
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findAccessibleById(actor, session.fileId),
    );
    if (file === null) throw new UploadNotFoundError();
    return { file: toFileSummary(file) };
  }

  /** Deja el objeto ensamblado en su clave final y devuelve su tamaño real, o rechaza la carga. */
  private assembleObject(actor: Actor, session: UploadSession, maxBytes: bigint): Promise<bigint> {
    const { multipart } = session;
    return multipart === null
      ? this.measureSimpleObject(actor, session, maxBytes)
      : this.completeParts(actor, session, multipart, maxBytes);
  }

  private async completeParts(
    actor: Actor,
    session: UploadSession,
    multipart: MultipartUpload,
    maxBytes: bigint,
  ): Promise<bigint> {
    const key = session.objectKey.value;
    const parts = await this.storage.listParts(key, multipart.uploadId);
    if (parts === null) return this.recoverClosedMultipart(actor, session, maxBytes);
    const verdict = assessParts(session.declaredBytes, multipart, parts, maxBytes);
    if (!verdict.ok) {
      if (verdict.violation === 'incomplete') throw new UploadIncompleteError();
      await this.reject(actor, session, 'tamano', () =>
        this.storage.abortMultipart(key, multipart.uploadId),
      );
      throw sizeErrorFor(verdict);
    }
    const closedHere = await this.storage.completeMultipart(key, multipart.uploadId, parts);
    if (!closedHere) return this.recoverClosedMultipart(actor, session, maxBytes);
    return verdict.sizeBytes;
  }

  /**
   * El multipart ya no existe: se completó y el proceso murió antes de registrar el archivo, o hubo un doble clic.
   * Si el objeto está, se sigue con él; si no, 409 si la carga sigue activa y 404 si ya no.
   */
  private async recoverClosedMultipart(
    actor: Actor,
    session: UploadSession,
    maxBytes: bigint,
  ): Promise<bigint> {
    const head = await this.storage.headObject(session.objectKey.value);
    if (head !== null) return this.checkObjectSize(actor, session, head.sizeBytes, maxBytes);
    const current = await this.findOwned(actor, session.id);
    throw current?.state === 'activa' ? new UploadIncompleteError() : new UploadNotFoundError();
  }

  private async measureSimpleObject(
    actor: Actor,
    session: UploadSession,
    maxBytes: bigint,
  ): Promise<bigint> {
    const head = await this.storage.headObject(session.objectKey.value);
    if (head === null) throw new UploadIncompleteError();
    return this.checkObjectSize(actor, session, head.sizeBytes, maxBytes);
  }

  private async checkObjectSize(
    actor: Actor,
    session: UploadSession,
    sizeBytes: bigint,
    maxBytes: bigint,
  ): Promise<bigint> {
    const verdict = assessObjectSize(session.declaredBytes, sizeBytes, maxBytes);
    if (verdict.ok) return verdict.sizeBytes;
    await this.reject(actor, session, 'tamano', () => this.purge(session));
    throw sizeErrorFor(verdict);
  }

  /**
   * Tipo real por rangos del objeto (CA-11, CA-12, CA-24); la extensión sale del nombre, no del cliente. `null` si el
   * objeto desapareció mientras se leía: `cancel`/`expire` ganó su CAS y lo purgó (Art. XI).
   */
  private async verifyType(
    actor: Actor,
    session: UploadSession,
    sizeBytes: bigint,
  ): Promise<FileKind | null> {
    const extension = session.name.extension();
    const result = await this.detectType(session, sizeBytes, extension);
    if (result === null) return null;
    if (result.ok) return result.kind;
    await this.reject(actor, session, 'tipo_invalido', () => this.purge(session));
    throw new InvalidFileTypeError(result.reason, extension);
  }

  /** Detecta el tipo; si la lectura falla y el objeto ya no existe, `null`. Cualquier otro fallo se propaga. */
  private async detectType(
    session: UploadSession,
    sizeBytes: bigint,
    extension: string,
  ): Promise<DetectionResult | null> {
    try {
      return await this.detector.detect(
        objectByteReader(this.storage, session.objectKey.value, sizeBytes),
        extension,
      );
    } catch (error) {
      if ((await this.storage.headObject(session.objectKey.value)) !== null) throw error;
      return null;
    }
  }

  /**
   * Rechaza la carga: CAS `activa → rechazada` con motivo y después borra lo subido (hasta 3 intentos). Si el CAS
   * pierde, otra petición la cerró y es quien limpia: responde según quién ganó.
   */
  private async reject(
    actor: Actor,
    session: UploadSession,
    reason: UploadRejectionReason,
    discard: () => Promise<void>,
  ): Promise<void> {
    const won = await this.transactions.withActor(actor, () =>
      this.sessions.transition(actor, session.id, 'activa', 'rechazada', {
        at: this.clock.now(),
        rejectionReason: reason,
      }),
    );
    if (!won) throw await this.raceLostError(actor, session.id);
    await this.retryDiscard(session, discard);
    this.logger.info({ event: 'upload.rejected', cargaId: session.id, reason });
    await recordAudit(
      this.audit,
      this.logger,
      {
        action: AuditAction.FILE_UPLOAD_REJECTED,
        actor,
        targetUserId: actor.id,
        resourceId: session.id,
        attributes: {
          reason,
          mode: CONTRACT_MODE[session.mode],
          sizeBytes: Number(session.declaredBytes),
        },
      },
      { cargaId: session.id },
    );
  }

  /**
   * Registro del archivo en una transacción (`UploadRegistrar`) y, tras el commit, la auditoría de mejor esfuerzo.
   * Si el CAS pierde contra otro `complete` de la misma carga (doble clic), responde el archivo que registró ese;
   * si pierde contra `cancel`/`expire`, no hay archivo: 410 o 404 según quién ganó. Si la carpeta destino ya no
   * está viva, la carga quedó `cancelada`: borra lo subido y responde 404 (006 CA-6).
   */
  private async register(
    actor: Actor,
    session: UploadSession,
    verified: VerifiedUpload,
  ): Promise<CompleteUploadResponse> {
    const registration = await this.registrar.register(actor, session, verified);
    if (registration.outcome === 'race_lost') return this.afterLostRegistration(actor, session.id);
    if (registration.outcome === 'destination_gone') return this.discardForGoneDestination(session);
    const { file } = registration;
    const sizeBytes = Number(file.sizeBytes);
    this.logger.info({ event: 'upload.completed', fileId: file.id, sizeBytes });
    await this.recordCompleted(actor, session, registration);
    return { file: toFileSummary(file) };
  }

  /** El objeto ya está ensamblado (también si fue por partes): se purga su clave. */
  private async discardForGoneDestination(session: UploadSession): Promise<never> {
    await this.retryDiscard(session, () => this.purge(session));
    this.logger.info({ event: 'upload.destination_gone', cargaId: session.id });
    throw new NodeNotFoundError();
  }

  /** Un reemplazo (014 CA-19) suma `replaced`, el UUID de la versión y su número. */
  private recordCompleted(
    actor: Actor,
    session: UploadSession,
    { file, version }: Registered,
  ): Promise<void> {
    const replacement = session.replacesFile
      ? { replaced: true, versionId: version.id, versionNumber: version.number }
      : {};
    return recordAudit(
      this.audit,
      this.logger,
      {
        action: AuditAction.FILE_UPLOAD_COMPLETED,
        actor,
        targetUserId: actor.id,
        resourceId: file.id,
        attributes: {
          sizeBytes: Number(file.sizeBytes),
          mode: CONTRACT_MODE[session.mode],
          ...replacement,
        },
      },
      { fileId: file.id },
    );
  }

  /**
   * Quien perdió el CAS final (o vio desaparecer el objeto): el archivo si otro `complete` lo registró; si no, 410 si
   * la carga venció y 404 en cualquier otro caso.
   */
  private async afterLostRegistration(
    actor: Actor,
    uploadId: string,
  ): Promise<CompleteUploadResponse> {
    const current = await this.findOwned(actor, uploadId);
    if (current?.state === 'completada') return this.completedFile(actor, current);
    throw current?.state === 'expirada' ? new UploadExpiredError() : new UploadNotFoundError();
  }

  /** Error para quien perdió un CAS: 410 si la carga venció, 404 en cualquier otro caso. */
  private async raceLostError(actor: Actor, uploadId: string): Promise<Error> {
    const current = await this.findOwned(actor, uploadId);
    return current?.state === 'expirada' ? new UploadExpiredError() : new UploadNotFoundError();
  }

  private purge(session: UploadSession): Promise<void> {
    return this.storage.purgeObject(session.objectKey.value);
  }

  private findOwned(actor: Actor, uploadId: string): Promise<UploadSession | null> {
    return this.transactions.withActor(actor, () => this.sessions.findOwned(actor, uploadId));
  }

  /** La sesión si sigue activa y vigente. Vencida ⇒ la vence y 410; cualquier otro caso ⇒ 404 (CA-16, CA-22). */
  private async requireActive(actor: Actor, session: UploadSession | null): Promise<UploadSession> {
    if (session?.state === 'expirada') throw new UploadExpiredError();
    if (session?.state !== 'activa') throw new UploadNotFoundError();
    if (session.isExpired(this.clock.now())) {
      await this.expire(actor, session.id);
      throw new UploadExpiredError();
    }
    return session;
  }

  /** CAS desde `activa`; `false` si otra petición ya la cerró (Art. XI). */
  private close(
    actor: Actor,
    session: UploadSession,
    to: 'cancelada' | 'expirada',
  ): Promise<boolean> {
    return this.sessions.transition(actor, session.id, 'activa', to, {
      at: this.clock.now(),
      rejectionReason: null,
    });
  }

  private async resumeResponse(session: UploadSession): Promise<ResumeUploadResponse> {
    const base = { uploadId: session.id, expiresAt: session.expiresAt.toISOString() };
    const urlsExpireAt = this.urlsExpireAt();
    const { multipart } = session;
    if (multipart === null) {
      const url = await this.signObject(session);
      return {
        ...base,
        mode: 'simple',
        completedParts: [],
        pending: { url, method: 'PUT', expiresAt: urlsExpireAt },
      };
    }
    const received = await this.receivedParts(session, multipart);
    const receivedNumbers = new Set(received.map((part) => part.partNumber));
    const missing = partNumbersOf(multipart).filter((n) => !receivedNumbers.has(n));
    return {
      ...base,
      mode: 'multipart',
      completedParts: received.map((part) => ({
        partNumber: part.partNumber,
        sizeBytes: Number(part.sizeBytes),
      })),
      pending: {
        partSizeBytes: Number(multipart.partSizeBytes),
        totalParts: multipart.totalParts,
        parts: await this.signParts(session, multipart, missing),
        urlsExpireAt,
      },
    };
  }

  /**
   * Partes recibidas según el almacenamiento. Si el multipart ya no existe (se completó y el proceso murió antes de
   * registrar el archivo), todas cuentan como recibidas: `complete` verifica el objeto y lo recupera.
   */
  private async receivedParts(
    session: UploadSession,
    multipart: MultipartUpload,
  ): Promise<readonly ReceivedPart[]> {
    const listed = await this.storage.listParts(session.objectKey.value, multipart.uploadId);
    if (listed !== null) return listed;
    return partNumbersOf(multipart).map((partNumber) => ({
      partNumber,
      sizeBytes: expectedPartBytes(session.declaredBytes, multipart, partNumber),
    }));
  }

  /**
   * Borra lo subido tras cerrar la sesión: aborta el multipart o purga todas las versiones de la clave, hasta 3
   * intentos. Si no se logra, queda un objeto huérfano sin `archivo` (no cuenta en la cuota, R-7) y se registra.
   */
  private discardObject(session: UploadSession): Promise<void> {
    const { multipart } = session;
    return this.retryDiscard(session, () =>
      multipart === null
        ? this.purge(session)
        : this.storage.abortMultipart(session.objectKey.value, multipart.uploadId),
    );
  }

  private async retryDiscard(session: UploadSession, discard: () => Promise<void>): Promise<void> {
    for (let attempt = 1; attempt <= DISCARD_ATTEMPTS; attempt += 1) {
      if (await succeeds(discard)) return;
    }
    this.logger.error({ event: 'upload.discard_failed', cargaId: session.id });
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

/** Parte recibida: la de `listParts` o, si el multipart ya se cerró, la esperada. */
interface ReceivedPart {
  readonly partNumber: number;
  readonly sizeBytes: bigint;
}

interface ReserveInput {
  readonly name: FileName;
  /** Carpeta destino (`null` = raíz, 006 CA-6). */
  readonly folderId: string | null;
  readonly declaredBytes: bigint;
  readonly onConflict: UploadOnConflict;
  readonly limits: PlanLimits;
}

/** Ids de la carga: el archivo es el que reemplaza (014 CA-1) o uno reservado; la versión siempre es nueva. */
function newIds(target: UploadTarget): { id: string; fileId: string; versionId: string } {
  return { id: randomUUID(), fileId: target.replaces?.id ?? randomUUID(), versionId: randomUUID() };
}

/** Campos de la sesión que salen de lo pedido y del destino resuelto. */
function sessionFields(actor: Actor, input: ReserveInput, target: UploadTarget) {
  return {
    ownerId: actor.id,
    folderId: input.folderId,
    name: input.name,
    keepBoth: input.onConflict === 'keep_both',
    replacesFile: target.replaces !== null,
    declaredBytes: input.declaredBytes,
  };
}

/** El esquema zod ya validó la forma; `FileName` es la regla de dominio (NFC, recorte) y responde el mismo 400. */
function parseName(raw: string): FileName {
  const parsed = FileName.parse(raw);
  if (parsed.ok) return parsed.name;
  throw new InvalidUploadRequestError([
    { field: 'name', reason: parsed.reason, message: STORAGE_FIELD_MESSAGES[parsed.reason] },
  ]);
}

/** 1…N de una carga por partes. */
function partNumbersOf(multipart: MultipartUpload): number[] {
  return Array.from({ length: multipart.totalParts }, (_, index) => index + 1);
}

/** `true` si la operación terminó; `false` si lanzó (el llamador decide si reintenta). */
async function succeeds(operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch {
    return false;
  }
}

/** Error de un veredicto de tamaño que rechaza la carga (CA-5, CA-7). */
function sizeErrorFor(verdict: Exclude<SizeVerdict, { ok: true }>): Error {
  switch (verdict.violation) {
    case 'too_large':
      return new FileTooLargeError(verdict.sizeBytes, verdict.maxBytes, formatBytes);
    case 'empty':
      return new EmptyFileError();
    default:
      return new UploadSizeMismatchError();
  }
}
