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

import { UPLOAD_FILE_CONCURRENCY, UPLOAD_PART_CONCURRENCY } from './upload-config';
import { putObject, type PutObjectRequest } from './xhr-put';

export const UPLOAD_PHASES = [
  'queued',
  'starting',
  'conflict',
  'uploading',
  'completing',
  'done',
  'rejected',
  'cancelled',
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
  }): Promise<InitUploadResponse>;
  resume(uploadId: string): Promise<ResumeUploadResponse>;
  complete(uploadId: string): Promise<CompleteUploadResponse>;
  cancel(uploadId: string): Promise<void>;
}

export interface UploadManagerOptions {
  readonly createId?: () => string;
  readonly put?: (request: PutObjectRequest) => Promise<void>;
}

interface UploadRecord extends UploadView {
  readonly batch: number;
  readonly source: LocalFile;
  readonly uploadId: string | null;
  readonly onConflict: OnConflict;
}

type RecordChange = Partial<Omit<UploadRecord, 'id' | 'batch' | 'source' | 'sizeBytes'>>;

const NO_DETAILS: StorageErrorDetails = {};
const NO_FAILURE = { errorCode: null, errorDetails: NO_DETAILS } as const;

/** Solo las cargas que envían o esperan al servidor ocupan uno de los 2 lugares; un diálogo no bloquea la cola. */
const SENDING_PHASES = new Set<UploadPhase>(['starting', 'uploading', 'completing']);

function toView(record: UploadRecord): UploadView {
  return {
    id: record.id,
    name: record.name,
    sizeBytes: record.sizeBytes,
    phase: record.phase,
    loadedBytes: record.loadedBytes,
    mode: record.mode,
    suggestedName: record.suggestedName,
    errorCode: record.errorCode,
    errorDetails: record.errorDetails,
    file: record.file,
  };
}

function slicePart(source: LocalFile, partNumber: number, partSize: number): Blob {
  const start = (partNumber - 1) * partSize;
  return source.slice(start, Math.min(start + partSize, source.size));
}

function failureOf(error: StorageRequestError): Pick<UploadView, 'errorCode' | 'errorDetails'> {
  return { errorCode: error.code, errorDetails: error.details };
}

/**
 * Orquesta las cargas de una pestaña (plan §6 Frontend): 2 archivos × 4 partes a la vez. El modo (simple o por partes)
 * lo dice el servidor. Recargar la pestaña pierde las cargas (RN-7).
 */
export class UploadManager {
  private records: readonly UploadRecord[] = [];
  private views: readonly UploadView[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly inflight = new Set<Promise<void>>();
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

  enqueue(files: readonly LocalFile[]): void {
    this.batches += 1;
    const batch = this.batches;
    this.commit([...this.records, ...files.map((file) => this.createRecord(file, batch))]);
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

  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all([...this.inflight]);
    }
  }

  private createRecord(source: LocalFile, batch: number): UploadRecord {
    this.sequence += 1;
    return {
      id: this.options.createId?.() ?? `upload-${this.sequence}`,
      batch,
      source,
      name: source.name,
      sizeBytes: source.size,
      phase: 'queued',
      loadedBytes: 0,
      mode: null,
      uploadId: null,
      onConflict: 'ask',
      suggestedName: null,
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
        this.track(this.start(record.id));
      });
  }

  private async start(id: string): Promise<void> {
    const record = this.require(id);
    try {
      const response = await this.client.init({
        name: record.name,
        sizeBytes: record.sizeBytes,
        onConflict: record.onConflict,
      });
      this.adoptSession(id, response);
      await this.sendInitial(id, response);
      await this.finish(id);
    } catch (error) {
      this.onFailure(id, error);
    } finally {
      this.pump();
    }
  }

  /** Guarda la sesión recién creada; `name` es el nombre visto al iniciar (D-4). */
  private adoptSession(id: string, response: InitUploadResponse): void {
    this.patch(id, {
      phase: 'uploading',
      uploadId: response.uploadId,
      mode: response.mode,
      name: response.name,
    });
  }

  private async sendInitial(id: string, response: InitUploadResponse): Promise<void> {
    if (response.mode === 'simple') {
      await this.sendWhole(id, response.upload.url);
      return;
    }
    await this.sendParts(id, response.parts, response.partSizeBytes, 0);
  }

  private async sendWhole(id: string, url: string): Promise<void> {
    const { source } = this.require(id);
    await this.putOnce(id, url, source.slice(0, source.size), (loaded) => {
      this.patch(id, { loadedBytes: loaded });
    });
  }

  private async sendParts(
    id: string,
    parts: readonly UploadPartUrl[],
    partSize: number,
    alreadyLoaded: number,
  ): Promise<void> {
    const queue = [...parts];
    const loadedByPart = new Map<number, number>();
    const report = (partNumber: number, loaded: number): void => {
      loadedByPart.set(partNumber, loaded);
      const inFlight = [...loadedByPart.values()].reduce((sum, value) => sum + value, 0);
      this.patch(id, { loadedBytes: alreadyLoaded + inFlight });
    };
    const worker = async (): Promise<void> => {
      for (let part = queue.shift(); part && !this.stopped(id); part = queue.shift()) {
        const { partNumber } = part;
        const body = slicePart(this.require(id).source, partNumber, partSize);
        await this.putOnce(id, part.url, body, (loaded) => report(partNumber, loaded));
      }
    };
    const workers = Math.min(UPLOAD_PART_CONCURRENCY, parts.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
  }

  private async putOnce(
    id: string,
    url: string,
    body: Blob,
    onLoaded: (loaded: number) => void,
  ): Promise<void> {
    await (this.options.put ?? putObject)({
      url,
      body,
      onProgress: (progress) => {
        if (this.require(id).phase === 'uploading') onLoaded(progress.loadedBytes);
      },
    });
    onLoaded(body.size);
  }

  /** `complete` no vence por tiempo de espera del cliente: la fila queda en `completing` lo que tarde (plan §6). */
  private async finish(id: string): Promise<void> {
    const record = this.require(id);
    if (record.phase !== 'uploading' || !record.uploadId) return;
    this.patch(id, { phase: 'completing', loadedBytes: record.sizeBytes });
    const { file } = await this.client.complete(record.uploadId);
    if (this.require(id).phase !== 'completing') return;
    this.patch(id, { phase: 'done', file, name: file.name });
  }

  private onFailure(id: string, error: unknown): void {
    if (!(error instanceof StorageRequestError)) {
      this.patch(id, { phase: 'rejected', ...NO_FAILURE });
      return;
    }
    if (error.code === STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) {
      this.onNameConflict(id, error);
      return;
    }
    this.patch(id, { phase: 'rejected', ...failureOf(error) });
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

  private stopped(id: string): boolean {
    return !SENDING_PHASES.has(this.require(id).phase);
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

  private track(work: Promise<void>): void {
    const tracked = work.finally(() => {
      this.inflight.delete(tracked);
    });
    this.inflight.add(tracked);
  }
}
