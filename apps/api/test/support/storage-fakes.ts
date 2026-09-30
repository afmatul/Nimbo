import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuditRecord, IAuditLogger } from '../../src/modules/audit';
import type {
  ByteReader,
  DetectionResult,
  IFileTypeDetector,
} from '../../src/modules/storage/application/ports/i-file-type-detector.port';
import type {
  FileListPage,
  INodeRepository,
} from '../../src/modules/storage/application/ports/i-node.repository.port';
import type {
  IObjectStorage,
  ObjectHead,
  PresignDownloadInput,
  PresignUploadObjectInput,
  PresignUploadPartInput,
  UploadedPart,
} from '../../src/modules/storage/application/ports/i-object-storage.port';
import type { IQuotaRepository } from '../../src/modules/storage/application/ports/i-quota.repository.port';
import type {
  IUploadSessionRepository,
  UploadTransitionPatch,
} from '../../src/modules/storage/application/ports/i-upload-session.repository.port';
import type { File } from '../../src/modules/storage/domain/file';
import type { FileName } from '../../src/modules/storage/domain/file-name.vo';
import type { FileVersion } from '../../src/modules/storage/domain/file-version';
import type { QuotaUsage } from '../../src/modules/storage/domain/quota-policy';
import { UploadSession } from '../../src/modules/storage/domain/upload-session';
import type { UploadState } from '../../src/modules/storage/domain/upload-session';
import type {
  Actor,
  IRateLimiter,
  ITransactionRunner,
  RateLimitDecision,
  RateLimitRule,
} from '../../src/shared';

/**
 * Dobles en memoria de los puertos de `storage` para las pruebas unitarias de sus servicios. Cada doble anota lo
 * que le piden en `journal` (compartido), para afirmar el orden de operaciones del plan §6.
 */
export class Journal {
  readonly entries: string[] = [];

  add(entry: string): void {
    this.entries.push(entry);
  }

  indexOf(entry: string): number {
    return this.entries.indexOf(entry);
  }
}

/** Bloqueos que retiene una transacción abierta con `FakeRowLocks.transaction`. */
interface HeldLocks {
  readonly ids: Set<string>;
  readonly releases: (() => void)[];
}

/**
 * `SELECT … FOR UPDATE` en memoria: `lock(id)` espera a que suelte la fila la transacción que la tiene y la retiene
 * hasta que termine la propia. Así dos transacciones concurrentes del mismo propietario se serializan como en
 * PostgreSQL, desde el bloqueo y no desde el `BEGIN`.
 */
export class FakeRowLocks {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly scope = new AsyncLocalStorage<HeldLocks>();

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    const held: HeldLocks = { ids: new Set(), releases: [] };
    try {
      return await this.scope.run(held, work);
    } finally {
      held.releases.forEach((release) => {
        release();
      });
    }
  }

  async lock(id: string): Promise<void> {
    const held = this.scope.getStore();
    if (held === undefined) throw new Error('FOR UPDATE fuera de una transacción');
    if (held.ids.has(id)) return;
    const previous = this.tails.get(id) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      id,
      previous.then(() => mine),
    );
    held.ids.add(id);
    held.releases.push(release);
    await previous;
  }
}

/** Corre el trabajo tal cual y anota la apertura y el cierre de cada transacción con actor. */
export class FakeTransactionRunner implements ITransactionRunner {
  readonly actors: string[] = [];
  readonly locks = new FakeRowLocks();

  constructor(private readonly journal: Journal) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  async withActor<T>(actor: Actor, work: () => Promise<T>): Promise<T> {
    this.actors.push(actor.id);
    this.journal.add('tx:begin');
    try {
      return await this.locks.transaction(work);
    } finally {
      this.journal.add('tx:end');
    }
  }
}

export class FakeRateLimiter implements IRateLimiter {
  readonly calls: { key: string; rules: readonly RateLimitRule[] }[] = [];
  decision: RateLimitDecision = { allowed: true };

  constructor(private readonly journal: Journal) {}

  consume(key: string, rules: readonly RateLimitRule[]): Promise<RateLimitDecision> {
    this.journal.add('rate:consume');
    this.calls.push({ key, rules });
    return Promise.resolve(this.decision);
  }
}

export class FakeQuotaRepository implements IQuotaRepository {
  usage: QuotaUsage = { usedBytes: 0n, reservedBytes: 0n };
  readonly added: bigint[] = [];

  /** Con `locks`, los dos métodos `lock*` retienen la fila del actor como `FOR UPDATE`. */
  constructor(
    private readonly journal: Journal,
    private readonly locks?: FakeRowLocks,
  ) {}

  async lockUsage(actor: Actor): Promise<bigint> {
    this.journal.add('quota:lockUsage');
    await this.locks?.lock(actor.id);
    return this.usage.usedBytes;
  }

  async lockAndReadUsage(actor: Actor): Promise<QuotaUsage> {
    this.journal.add('quota:lockAndReadUsage');
    await this.locks?.lock(actor.id);
    return this.usage;
  }

  addUsedBytes(_actor: Actor, deltaBytes: bigint): Promise<void> {
    this.journal.add('quota:addUsedBytes');
    this.added.push(deltaBytes);
    return Promise.resolve();
  }
}

/** Sesiones por id con dueño; `findOwned` de otro dueño devuelve `null`, como la RLS. */
export class FakeUploadSessionRepository implements IUploadSessionRepository {
  readonly sessions = new Map<string, UploadSession>();
  readonly transitions: {
    id: string;
    from: UploadState;
    to: UploadState;
    patch: UploadTransitionPatch;
  }[] = [];
  /** Estado que otra petición deja justo antes del próximo CAS (simula perder la carrera). */
  raceTo: UploadState | null = null;

  constructor(private readonly journal: Journal) {}

  insert(_actor: Actor, session: UploadSession): Promise<void> {
    this.journal.add('session:insert');
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  findOwned(actor: Actor, id: string): Promise<UploadSession | null> {
    this.journal.add('session:findOwned');
    const session = this.sessions.get(id);
    return Promise.resolve(session?.ownerId === actor.id ? session : null);
  }

  transition(
    _actor: Actor,
    id: string,
    from: UploadState,
    to: UploadState,
    patch: UploadTransitionPatch,
  ): Promise<boolean> {
    this.journal.add(`session:transition:${to}`);
    this.applyRace(id);
    const session = this.sessions.get(id);
    if (session?.state !== from) return Promise.resolve(false);
    this.transitions.push({ id, from, to, patch });
    this.sessions.set(
      id,
      UploadSession.rehydrate({ ...session.snapshot(), ...stateOf(to, patch) }),
    );
    return Promise.resolve(true);
  }

  put(session: UploadSession): void {
    this.sessions.set(session.id, session);
  }

  private applyRace(id: string): void {
    const session = this.sessions.get(id);
    if (this.raceTo === null || session === undefined) return;
    const at = new Date();
    const rejectionReason = this.raceTo === 'rechazada' ? 'tamano' : null;
    this.sessions.set(
      id,
      UploadSession.rehydrate({
        ...session.snapshot(),
        ...stateOf(this.raceTo, { at, rejectionReason }),
      }),
    );
    this.raceTo = null;
  }
}

function stateOf(to: UploadState, patch: UploadTransitionPatch) {
  return {
    state: to,
    rejectionReason: patch.rejectionReason,
    updatedAt: patch.at,
    finishedAt: patch.at,
  };
}

export class FakeNodeRepository implements INodeRepository {
  taken: string[] = [];
  readonly namesAsked: string[] = [];
  readonly files = new Map<string, File>();
  readonly inserted: { file: File; version: FileVersion }[] = [];

  constructor(private readonly journal: Journal) {}

  findAccessibleById(actor: Actor, id: string): Promise<File | null> {
    this.journal.add('nodes:findAccessibleById');
    const file = this.files.get(id);
    return Promise.resolve(file?.ownerId === actor.id ? file : null);
  }

  listAccessible(): Promise<FileListPage> {
    return Promise.resolve({ items: [...this.files.values()], nextCursor: null });
  }

  /** Los nombres que la prueba fija como ocupados más los de los archivos del actor ya insertados. */
  findTakenNames(actor: Actor, name: FileName): Promise<readonly string[]> {
    this.journal.add('nodes:findTakenNames');
    this.namesAsked.push(name.value);
    const owned = [...this.files.values()].filter((file) => file.ownerId === actor.id);
    return Promise.resolve([...this.taken, ...owned.map((file) => file.name.value)]);
  }

  insertWithVersion(_actor: Actor, file: File, version: FileVersion): Promise<void> {
    this.journal.add('nodes:insertWithVersion');
    this.inserted.push({ file, version });
    this.files.set(file.id, file);
    return Promise.resolve();
  }
}

/** Almacenamiento en memoria: objetos por clave y cargas por partes con sus partes. */
export class FakeObjectStorage implements IObjectStorage {
  readonly objects = new Map<string, Buffer>();
  readonly multiparts = new Map<string, UploadedPart[]>();
  readonly aborted: string[] = [];
  readonly purged: string[] = [];
  readonly completed: { key: string; parts: readonly UploadedPart[] }[] = [];
  readonly signedParts: PresignUploadPartInput[] = [];
  readonly signedObjects: PresignUploadObjectInput[] = [];
  failCreateMultipart = false;
  failSigning = false;
  /** Cuántas veces más fallará el próximo borrado (`abortMultipart` o `purgeObject`). */
  deleteFailures = 0;
  private nextMultipart = 0;

  constructor(private readonly journal: Journal) {}

  createMultipart(key: string): Promise<string> {
    this.journal.add('storage:createMultipart');
    if (this.failCreateMultipart) return Promise.reject(new Error('minio caído'));
    this.nextMultipart += 1;
    const uploadId = `mp-${String(this.nextMultipart)}`;
    this.multiparts.set(this.multipartKey(key, uploadId), []);
    return Promise.resolve(uploadId);
  }

  presignUploadPart(input: PresignUploadPartInput): Promise<string> {
    this.journal.add('storage:presign');
    if (this.failSigning) return Promise.reject(new Error('firma'));
    this.signedParts.push(input);
    return Promise.resolve(`https://s3.test/${input.key}?part=${String(input.partNumber)}`);
  }

  presignUploadObject(input: PresignUploadObjectInput): Promise<string> {
    this.journal.add('storage:presign');
    if (this.failSigning) return Promise.reject(new Error('firma'));
    this.signedObjects.push(input);
    return Promise.resolve(`https://s3.test/${input.key}`);
  }

  listParts(key: string, uploadId: string): Promise<readonly UploadedPart[] | null> {
    this.journal.add('storage:listParts');
    const parts = this.multiparts.get(this.multipartKey(key, uploadId));
    return Promise.resolve(parts === undefined ? null : [...parts]);
  }

  completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[],
  ): Promise<boolean> {
    this.journal.add('storage:completeMultipart');
    if (!this.multiparts.delete(this.multipartKey(key, uploadId))) return Promise.resolve(false);
    this.completed.push({ key, parts });
    const total = parts.reduce((sum, part) => sum + Number(part.sizeBytes), 0);
    this.objects.set(key, this.pendingContent.get(key) ?? Buffer.alloc(total));
    return Promise.resolve(true);
  }

  abortMultipart(key: string, uploadId: string): Promise<void> {
    this.journal.add('storage:abortMultipart');
    if (this.consumeDeleteFailure()) return Promise.reject(new Error('minio caído'));
    this.aborted.push(key);
    this.multiparts.delete(this.multipartKey(key, uploadId));
    return Promise.resolve();
  }

  headObject(key: string): Promise<ObjectHead | null> {
    this.journal.add('storage:headObject');
    const object = this.objects.get(key);
    return Promise.resolve(object === undefined ? null : { sizeBytes: BigInt(object.length) });
  }

  /** Como el adaptador real: un objeto ausente rechaza (S3 responde `NoSuchKey`). */
  getRange(key: string, start: number, endInclusive: number): Promise<Buffer> {
    const object = this.objects.get(key);
    if (object === undefined) {
      return Promise.reject(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    }
    return Promise.resolve(object.subarray(start, endInclusive + 1));
  }

  purgeObject(key: string): Promise<void> {
    this.journal.add('storage:purgeObject');
    if (this.consumeDeleteFailure()) return Promise.reject(new Error('minio caído'));
    this.purged.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }

  presignDownload(input: PresignDownloadInput): Promise<string> {
    return Promise.resolve(`https://s3.test/${input.key}?download`);
  }

  /** Contenido con el que quedará el objeto al completar el multipart (por defecto, ceros). */
  readonly pendingContent = new Map<string, Buffer>();

  addPart(key: string, uploadId: string, partNumber: number, sizeBytes: bigint): void {
    const parts = this.multiparts.get(this.multipartKey(key, uploadId)) ?? [];
    this.multiparts.set(this.multipartKey(key, uploadId), [
      ...parts,
      { partNumber, sizeBytes, etag: `etag-${String(partNumber)}` },
    ]);
  }

  private consumeDeleteFailure(): boolean {
    if (this.deleteFailures === 0) return false;
    this.deleteFailures -= 1;
    return true;
  }

  private multipartKey(key: string, uploadId: string): string {
    return `${key}#${uploadId}`;
  }
}

/** Detector que responde lo que la prueba fija y anota la extensión y el tamaño que recibió. */
export class FakeFileTypeDetector implements IFileTypeDetector {
  result: DetectionResult = { ok: true, kind: 'docx', mime: 'application/octet-stream' };
  readonly calls: { extension: string; size: number }[] = [];

  constructor(private readonly journal: Journal) {}

  detect(reader: ByteReader, extension: string): Promise<DetectionResult> {
    this.journal.add('detector:detect');
    this.calls.push({ extension, size: reader.size });
    return Promise.resolve(this.result);
  }
}

/** Auditoría en memoria; con `fails` lanza como lo haría un adaptador caído. */
export class FakeAuditLogger implements IAuditLogger {
  readonly records: AuditRecord[] = [];
  fails = false;

  constructor(private readonly journal: Journal) {}

  record(entry: AuditRecord): Promise<void> {
    this.journal.add(`audit:${entry.action}`);
    if (this.fails) return Promise.reject(new Error('auditoría caída'));
    this.records.push(entry);
    return Promise.resolve();
  }
}
