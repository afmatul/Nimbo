import {
  STORAGE_ERROR_CODES,
  type CompleteUploadResponse,
  type FileSummary,
  type InitUploadResponse,
  type OnConflict,
  type ResumeUploadResponse,
  type UploadMode,
  type UploadPartUrl,
} from '@nimbo/contracts';

import { StorageRequestError, type StorageErrorDetails } from '../storage-request-error';

import {
  UPLOAD_FILE_CONCURRENCY,
  UPLOAD_PART_ATTEMPTS,
  UPLOAD_PART_CONCURRENCY,
  retryDelayMs,
} from './upload-config';
import { XhrPutFailedError, putObject, type PutObjectRequest } from './xhr-put';

export const UPLOAD_PHASES = [
  'queued',
  'starting',
  'conflict',
  'uploading',
  'paused',
  'offline',
  'completing',
  'done',
  'rejected',
  'cancelled',
  'expired',
  'rate_limited',
] as const;

export type UploadPhase = (typeof UPLOAD_PHASES)[number];

/** Respuesta al diálogo de nombre repetido (CA-6): «Conservar ambos» o «Cancelar». */
export type ConflictDecision = 'keep_both' | 'discard';

/** Lo que el manager necesita de un `File` del navegador: se lee por trozos, nunca entero en memoria. */
export interface LocalFile {
  readonly name: string;
  readonly size: number;
  slice(start: number, end: number): Blob;
}

export interface UploadView {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly phase: UploadPhase;
  readonly loadedBytes: number;
  readonly mode: UploadMode | null;
  readonly suggestedName: string | null;
  /** Carga simple detenida: al reanudar empieza de cero («Se reiniciará al reanudar», D-2). */
  readonly restartsOnResume: boolean;
  /** El diálogo «¿Cancelar esta carga?» está abierto; mientras tanto la carga sigue en pausa (CA-22). */
  readonly awaitingCancel: boolean;
  readonly errorCode: string | null;
  readonly errorDetails: StorageErrorDetails;
  readonly file: FileSummary | null;
}

/** Puerto HTTP del manager. Un error HTTP llega como `StorageRequestError`; cualquier otro, como corte de red. */
export interface UploadClient {
  init(body: {
    readonly name: string;
    readonly sizeBytes: number;
    readonly onConflict: OnConflict;
    /** Carpeta destino; `null` es la raíz (006 CA-6). */
    readonly folderId: string | null;
  }): Promise<InitUploadResponse>;
  resume(uploadId: string): Promise<ResumeUploadResponse>;
  complete(uploadId: string): Promise<CompleteUploadResponse>;
  cancel(uploadId: string): Promise<void>;
}

export interface UploadManagerOptions {
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
  readonly createId?: () => string;
  readonly put?: (request: PutObjectRequest) => Promise<void>;
  readonly isOnline?: () => boolean;
}

interface UploadRecord extends UploadView {
  readonly batch: number;
  readonly source: LocalFile;
  /** Carpeta abierta al encolar; el nombre repetido se evalúa en ella (006 CA-6). */
  readonly folderId: string | null;
  readonly uploadId: string | null;
  readonly onConflict: OnConflict;
  /** Todos los bytes ya están en el almacenamiento: reanudar vuelve a `complete`, no a `resume`. */
  readonly transferred: boolean;
  /** «Seguir subiendo» reanuda solo si la carga iba en curso al pedir cancelar. */
  readonly resumeOnDismiss: boolean;
}

interface Flow {
  readonly id: string;
  readonly run: number;
}

type RecordChange = Partial<
  Omit<UploadRecord, 'id' | 'batch' | 'source' | 'folderId' | 'sizeBytes'>
>;

const HTTP_FORBIDDEN = 403;
const HTTP_GONE = 410;
const HTTP_TOO_MANY_REQUESTS = 429;
const NETWORK_STATUS = 0;

const NO_DETAILS: StorageErrorDetails = {};
const NO_FAILURE = { errorCode: null, errorDetails: NO_DETAILS } as const;

/** Solo las cargas que envían o esperan al servidor ocupan uno de los 2 lugares; pausa y diálogos no bloquean la cola. */
const SENDING_PHASES = new Set<UploadPhase>(['starting', 'uploading', 'completing']);
const CANCELLABLE_PHASES = new Set<UploadPhase>([
  'queued',
  'starting',
  'conflict',
  'uploading',
  'paused',
  'offline',
  'rate_limited',
]);

class NetworkLostError extends Error {
  constructor() {
    super('Se cortó la conexión.');
    this.name = 'NetworkLostError';
  }
}

class TransferFailedError extends Error {
  constructor() {
    super('No se pudo enviar el archivo.');
    this.name = 'TransferFailedError';
  }
}

function toView(record: UploadRecord): UploadView {
  return {
    id: record.id,
    name: record.name,
    sizeBytes: record.sizeBytes,
    phase: record.phase,
    loadedBytes: record.loadedBytes,
    mode: record.mode,
    suggestedName: record.suggestedName,
    restartsOnResume: record.restartsOnResume,
    awaitingCancel: record.awaitingCancel,
    errorCode: record.errorCode,
    errorDetails: record.errorDetails,
    file: record.file,
  };
}

function slicePart(source: LocalFile, partNumber: number, partSize: number): Blob {
  const start = (partNumber - 1) * partSize;
  return source.slice(start, Math.min(start + partSize, source.size));
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function failureOf(error: StorageRequestError): Pick<UploadView, 'errorCode' | 'errorDetails'> {
  return { errorCode: error.code, errorDetails: error.details };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * Orquesta las cargas de una pestaña (plan §6 Frontend): 2 archivos × 4 partes a la vez. El modo (simple o por partes)
 * lo dice el servidor. Pausar no llama a la API: solo deja de enviar bytes. Recargar la pestaña pierde las cargas (RN-7).
 */
export class UploadManager {
  private records: readonly UploadRecord[] = [];
  private views: readonly UploadView[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly inflight = new Set<Promise<void>>();
  private readonly aborts = new Map<string, Set<AbortController>>();
  /** Turno vigente de cada carga: pausar, cortar o cancelar lo avanza y vuelve obsoletos los flujos anteriores. */
  private readonly runs = new Map<string, number>();
  /** «Aplicar a los demás»: decisión fijada por selección (lote de `enqueue`). */
  private readonly batchDecisions = new Map<number, ConflictDecision>();
  private sequence = 0;
  private batches = 0;

  constructor(
    private readonly client: UploadClient,
    private readonly options: UploadManagerOptions = {},
  ) {}

  /** Vista inmutable; la referencia solo cambia cuando cambia algo (apta para `useSyncExternalStore`). */
  snapshot(): readonly UploadView[] {
    return this.views;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Encola `files` en la carpeta `folderId` (`null` es la raíz). */
  enqueue(files: readonly LocalFile[], folderId: string | null = null): void {
    this.batches += 1;
    const batch = this.batches;
    this.commit([
      ...this.records,
      ...files.map((file) => this.createRecord(file, batch, folderId)),
    ]);
    this.pump();
  }

  /** Nombres repetidos que siguen esperando respuesta en la selección de `id`, sin contarlo (ayuda de la casilla). */
  pendingConflictsInBatch(id: string): number {
    const { batch } = this.require(id);
    return this.records.filter(
      (record) => record.id !== id && record.batch === batch && record.phase === 'conflict',
    ).length;
  }

  resolveConflict(id: string, decision: ConflictDecision, applyToRest = false): void {
    const record = this.require(id);
    if (record.phase !== 'conflict') return;
    if (applyToRest) {
      this.batchDecisions.set(record.batch, decision);
      this.records
        .filter((other) => other.batch === record.batch && other.phase === 'conflict')
        .forEach((other) => this.applyDecision(other.id, decision));
    } else {
      this.applyDecision(id, decision);
    }
    this.pump();
  }

  pause(id: string): void {
    const record = this.require(id);
    if (record.phase !== 'uploading' && record.phase !== 'starting') return;
    this.stopSending(id);
    this.patch(id, { phase: 'paused', restartsOnResume: record.mode === 'simple' });
    this.pump();
  }

  resume(id: string): void {
    const record = this.require(id);
    if (record.phase !== 'paused' && record.phase !== 'offline') return;
    this.patch(id, { awaitingCancel: false, resumeOnDismiss: false });
    if (!record.uploadId) {
      this.patch(id, { phase: 'queued' });
      this.pump();
      return;
    }
    this.patch(id, { phase: 'uploading' });
    this.track(this.continueUpload(this.flowOf(id), record.uploadId));
  }

  /** «Reintentar» tras un `429`: siempre habilitado, sin cuenta regresiva (CA-19). */
  retry(id: string): void {
    if (this.require(id).phase !== 'rate_limited') return;
    this.patch(id, { phase: 'queued', ...NO_FAILURE });
    this.pump();
  }

  /** Con 0 % cancela directo; con progreso pausa y espera `confirmCancel` o `dismissCancel` (CA-22). */
  requestCancel(id: string): void {
    const record = this.require(id);
    if (!CANCELLABLE_PHASES.has(record.phase)) return;
    if (record.loadedBytes === 0) {
      this.cancelNow(id);
      return;
    }
    const wasSending = record.phase === 'uploading' || record.phase === 'starting';
    if (wasSending) this.pause(id);
    this.patch(id, { awaitingCancel: true, resumeOnDismiss: wasSending });
  }

  confirmCancel(id: string): void {
    if (this.require(id).awaitingCancel) this.cancelNow(id);
  }

  dismissCancel(id: string): void {
    const record = this.require(id);
    if (!record.awaitingCancel) return;
    this.patch(id, { awaitingCancel: false, resumeOnDismiss: false });
    if (record.resumeOnDismiss) this.resume(id);
  }

  /** Evento `offline` del navegador: todo lo que envía queda «Carga en espera» (CA-8). */
  networkOffline(): void {
    this.records
      .filter((record) => record.phase === 'uploading' || record.phase === 'starting')
      .forEach((record) => this.goOffline(record.id));
  }

  /** Evento `online`: reanuda las cargas en espera; las que esperan confirmar la cancelación siguen quietas. */
  networkOnline(): void {
    this.records
      .filter((record) => record.phase === 'offline' && !record.awaitingCancel)
      .forEach((record) => this.resume(record.id));
  }

  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all([...this.inflight]);
    }
  }

  private createRecord(source: LocalFile, batch: number, folderId: string | null): UploadRecord {
    this.sequence += 1;
    return {
      id: this.options.createId?.() ?? `upload-${this.sequence}`,
      batch,
      source,
      folderId,
      name: source.name,
      sizeBytes: source.size,
      phase: 'queued',
      loadedBytes: 0,
      mode: null,
      uploadId: null,
      onConflict: 'ask',
      suggestedName: null,
      restartsOnResume: false,
      awaitingCancel: false,
      resumeOnDismiss: false,
      transferred: false,
      ...NO_FAILURE,
      file: null,
    };
  }

  private pump(): void {
    const sending = this.records.filter((record) => SENDING_PHASES.has(record.phase)).length;
    const room = Math.max(0, UPLOAD_FILE_CONCURRENCY - sending);
    this.records
      .filter((record) => record.phase === 'queued')
      .slice(0, room)
      .forEach((record) => {
        this.patch(record.id, { phase: 'starting' });
        this.track(this.start(this.flowOf(record.id)));
      });
  }

  private async start(flow: Flow): Promise<void> {
    const record = this.require(flow.id);
    try {
      const response = await this.client.init({
        name: record.name,
        sizeBytes: record.sizeBytes,
        onConflict: record.onConflict,
        folderId: record.folderId,
      });
      if (!this.adoptSession(flow, response)) return;
      await this.sendInitial(flow, response);
      await this.finish(flow);
    } catch (error) {
      this.onFailure(flow, error);
    } finally {
      this.pump();
    }
  }

  /**
   * Guarda la sesión recién creada; `name` es el nombre visto al iniciar (D-4). Si la carga se pausó mientras tanto,
   * queda lista para `resume`; si se canceló, se cancela también en el servidor.
   */
  private adoptSession(flow: Flow, response: InitUploadResponse): boolean {
    const { phase } = this.require(flow.id);
    if (phase === 'cancelled') {
      this.cancelOnServer(response.uploadId);
      return false;
    }
    const live = !this.isStale(flow);
    this.patch(flow.id, {
      uploadId: response.uploadId,
      mode: response.mode,
      name: response.name,
      restartsOnResume: response.mode === 'simple' && !live,
      ...(live ? { phase: 'uploading' } : {}),
    });
    return live;
  }

  private async sendInitial(flow: Flow, response: InitUploadResponse): Promise<void> {
    if (response.mode === 'simple') {
      await this.sendWhole(flow, response.upload.url);
      return;
    }
    await this.sendParts(flow, response.parts, response.partSizeBytes, 0);
  }

  private async continueUpload(flow: Flow, uploadId: string): Promise<void> {
    try {
      if (!this.require(flow.id).transferred) await this.sendPending(flow, uploadId);
      await this.finish(flow);
    } catch (error) {
      this.onFailure(flow, error);
    } finally {
      this.pump();
    }
  }

  /** `resume`: la simple vuelve a empezar; por partes solo sube las que faltan (CA-8). */
  private async sendPending(flow: Flow, uploadId: string): Promise<void> {
    const resumed = await this.client.resume(uploadId);
    if (this.isStale(flow)) return;
    if (resumed.mode === 'simple') {
      this.patch(flow.id, { loadedBytes: 0, restartsOnResume: false });
      await this.sendWhole(flow, resumed.pending.url);
      return;
    }
    const done = resumed.completedParts.reduce((sum, part) => sum + part.sizeBytes, 0);
    this.patch(flow.id, { loadedBytes: done });
    await this.sendParts(flow, resumed.pending.parts, resumed.pending.partSizeBytes, done);
  }

  private async sendWhole(flow: Flow, url: string): Promise<void> {
    const { source } = this.require(flow.id);
    await this.putWithRetry(flow, url, source.slice(0, source.size), (loaded) => {
      this.patch(flow.id, { loadedBytes: loaded });
    });
  }

  private async sendParts(
    flow: Flow,
    parts: readonly UploadPartUrl[],
    partSize: number,
    alreadyLoaded: number,
  ): Promise<void> {
    const queue = [...parts];
    const loadedByPart = new Map<number, number>();
    const report = (partNumber: number, loaded: number): void => {
      loadedByPart.set(partNumber, loaded);
      const inFlight = [...loadedByPart.values()].reduce((sum, value) => sum + value, 0);
      this.patch(flow.id, { loadedBytes: alreadyLoaded + inFlight });
    };
    let failure: Error | null = null;
    const worker = async (): Promise<void> => {
      for (
        let part = queue.shift();
        part && !failure && !this.isStale(flow);
        part = queue.shift()
      ) {
        const { partNumber } = part;
        const body = slicePart(this.require(flow.id).source, partNumber, partSize);
        try {
          await this.putWithRetry(
            flow,
            part.url,
            body,
            (loaded) => report(partNumber, loaded),
            partNumber,
          );
        } catch (error) {
          failure ??= error instanceof Error ? error : new TransferFailedError();
          this.abortTransfers(flow.id);
        }
      }
    };
    const workers = Math.min(UPLOAD_PART_CONCURRENCY, parts.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    if (failure) throw failure;
  }

  /** Un `PUT` con hasta 5 intentos y espera exponencial con jitter; `403` (URL vencida) pide URLs nuevas. */
  private async putWithRetry(
    flow: Flow,
    firstUrl: string,
    body: Blob,
    onLoaded: (loaded: number) => void,
    partNumber?: number,
  ): Promise<void> {
    let url = firstUrl;
    for (let attempt = 1; !this.isStale(flow); attempt += 1) {
      try {
        await this.putOnce(flow, url, body, onLoaded);
        onLoaded(body.size);
        return;
      } catch (error) {
        if (isAbort(error) || this.isStale(flow)) return;
        this.assertCanRetry(error, attempt);
        if (error instanceof XhrPutFailedError && error.status === HTTP_FORBIDDEN) {
          url = await this.refreshUrl(flow, partNumber);
        } else {
          await this.sleep(retryDelayMs(attempt, this.options.random ?? Math.random));
        }
      }
    }
  }

  private assertCanRetry(error: unknown, attempt: number): void {
    const network = error instanceof XhrPutFailedError && error.status === NETWORK_STATUS;
    const isOnline = this.options.isOnline ?? browserIsOnline;
    if (network && !isOnline()) throw new NetworkLostError();
    if (attempt < UPLOAD_PART_ATTEMPTS) return;
    throw network ? new NetworkLostError() : new TransferFailedError();
  }

  private async putOnce(
    flow: Flow,
    url: string,
    body: Blob,
    onLoaded: (loaded: number) => void,
  ): Promise<void> {
    const controller = new AbortController();
    const group = this.aborts.get(flow.id) ?? new Set<AbortController>();
    this.aborts.set(flow.id, group.add(controller));
    try {
      await (this.options.put ?? putObject)({
        url,
        body,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!this.isStale(flow)) onLoaded(progress.loadedBytes);
        },
      });
    } finally {
      this.aborts.get(flow.id)?.delete(controller);
    }
  }

  private async refreshUrl(flow: Flow, partNumber?: number): Promise<string> {
    const { uploadId } = this.require(flow.id);
    const resumed = await this.client.resume(uploadId ?? '');
    if (resumed.mode === 'simple') return resumed.pending.url;
    const part = resumed.pending.parts.find((candidate) => candidate.partNumber === partNumber);
    if (!part) throw new TransferFailedError();
    return part.url;
  }

  /** `complete` no vence por tiempo de espera del cliente: la fila queda en `completing` lo que tarde (plan §6). */
  private async finish(flow: Flow): Promise<void> {
    const record = this.require(flow.id);
    if (this.isStale(flow) || record.phase !== 'uploading' || !record.uploadId) return;
    this.patch(flow.id, { phase: 'completing', transferred: true, loadedBytes: record.sizeBytes });
    const { file } = await this.client.complete(record.uploadId);
    if (this.isStale(flow)) return;
    this.patch(flow.id, { phase: 'done', file, name: file.name });
  }

  private onFailure(flow: Flow, error: unknown): void {
    if (this.isStale(flow)) return;
    if (error instanceof StorageRequestError) {
      this.onRequestError(flow.id, error);
      return;
    }
    if (error instanceof TransferFailedError) {
      this.reject(flow.id, NO_FAILURE);
      return;
    }
    this.goOffline(flow.id);
  }

  private onRequestError(id: string, error: StorageRequestError): void {
    if (error.code === STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) {
      this.onNameConflict(id, error);
      return;
    }
    if (error.status === HTTP_TOO_MANY_REQUESTS) {
      this.patch(id, { phase: 'rate_limited', ...failureOf(error) });
      return;
    }
    if (error.status === HTTP_GONE) {
      this.patch(id, { phase: 'expired', ...failureOf(error) });
      return;
    }
    this.reject(id, failureOf(error));
  }

  private onNameConflict(id: string, error: StorageRequestError): void {
    const suggested = error.details['suggestedName'];
    this.patch(id, {
      phase: 'conflict',
      suggestedName: typeof suggested === 'string' ? suggested : null,
    });
    const decided = this.batchDecisions.get(this.require(id).batch);
    if (decided) this.applyDecision(id, decided);
  }

  private applyDecision(id: string, decision: ConflictDecision): void {
    if (decision === 'discard') {
      this.patch(id, { phase: 'cancelled' });
      return;
    }
    this.patch(id, { phase: 'queued', onConflict: 'keep_both' });
  }

  private reject(id: string, failure: Pick<UploadView, 'errorCode' | 'errorDetails'>): void {
    const { uploadId } = this.require(id);
    this.stopSending(id);
    this.patch(id, { phase: 'rejected', ...failure });
    if (uploadId) this.cancelOnServer(uploadId);
  }

  private goOffline(id: string): void {
    const record = this.require(id);
    this.stopSending(id);
    this.patch(id, { phase: 'offline', restartsOnResume: record.mode === 'simple' });
  }

  private cancelNow(id: string): void {
    const { uploadId } = this.require(id);
    this.stopSending(id);
    this.patch(id, { phase: 'cancelled', awaitingCancel: false, resumeOnDismiss: false });
    if (uploadId) this.cancelOnServer(uploadId);
    this.pump();
  }

  /** Libera la reserva de cuota. Un `404` (ya cancelada o completada) es éxito. */
  private cancelOnServer(uploadId: string): void {
    this.track(this.client.cancel(uploadId).catch(() => undefined));
  }

  private abortTransfers(id: string): void {
    this.aborts.get(id)?.forEach((controller) => controller.abort());
    this.aborts.delete(id);
  }

  /** Aborta los `PUT` en curso y deja obsoleto todo flujo anterior de esa carga. */
  private stopSending(id: string): void {
    this.abortTransfers(id);
    this.runs.set(id, (this.runs.get(id) ?? 0) + 1);
  }

  private flowOf(id: string): Flow {
    return { id, run: this.runs.get(id) ?? 0 };
  }

  /** Un flujo obsoleto (pausa, corte o cancelación posteriores) ya no toca la fila. */
  private isStale(flow: Flow): boolean {
    return (
      (this.runs.get(flow.id) ?? 0) !== flow.run || !SENDING_PHASES.has(this.require(flow.id).phase)
    );
  }

  private patch(id: string, change: RecordChange): void {
    this.commit(
      this.records.map((record) => (record.id === id ? { ...record, ...change } : record)),
    );
  }

  private commit(records: readonly UploadRecord[]): void {
    this.records = records;
    this.views = records.map(toView);
    this.listeners.forEach((listener) => listener());
  }

  private require(id: string): UploadRecord {
    const record = this.records.find((item) => item.id === id);
    if (!record) throw new Error(`No existe la carga ${id}.`);
    return record;
  }

  private sleep(milliseconds: number): Promise<void> {
    return (this.options.sleep ?? defaultSleep)(milliseconds);
  }

  private track(work: Promise<void>): void {
    const tracked = work.finally(() => {
      this.inflight.delete(tracked);
    });
    this.inflight.add(tracked);
  }
}
