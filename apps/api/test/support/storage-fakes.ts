import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';

import type { AuditRecord, IAuditLogger } from '../../src/modules/audit';
import type {
  ByteReader,
  DetectionResult,
  IFileTypeDetector,
} from '../../src/modules/storage/application/ports/i-file-type-detector.port';
import type {
  FileVersionRef,
  IdPage,
  INodeRepository,
  NodeListPage,
  NodeListQuery,
} from '../../src/modules/storage/application/ports/i-node.repository.port';
import type {
  IObjectStorage,
  ObjectHead,
  PresignDownloadInput,
  PutObjectInput,
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
import { Folder } from '../../src/modules/storage/domain/folder';
import type { FolderName } from '../../src/modules/storage/domain/folder-name.vo';
import { FolderPath } from '../../src/modules/storage/domain/folder-path';
import type { QuotaUsage } from '../../src/modules/storage/domain/quota-policy';
import { UploadSession } from '../../src/modules/storage/domain/upload-session';
import type { UploadState } from '../../src/modules/storage/domain/upload-session';
import type {
  Actor,
  IDomainEventPublisher,
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

  /** Sin bloqueo: no espera a la transacción que tenga la fila (007 D-1). */
  readUsage(): Promise<QuotaUsage> {
    this.journal.add('quota:readUsage');
    return Promise.resolve(this.usage);
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

/**
 * Árbol en memoria: archivos y carpetas por id. Ve solo lo propio y vivo, como `accessibleNodes(actor)`; no pagina
 * (`nextCursor` siempre `null`).
 */
export class FakeNodeRepository implements INodeRepository {
  taken: string[] = [];
  readonly namesAsked: string[] = [];
  readonly files = new Map<string, File>();
  readonly folders = new Map<string, Folder>();
  readonly inserted: { file: File; version: FileVersion }[] = [];
  readonly listed: NodeListQuery[] = [];

  constructor(private readonly journal: Journal) {}

  findAccessibleById(actor: Actor, id: string): Promise<File | null> {
    this.journal.add('nodes:findAccessibleById');
    const file = this.files.get(id);
    return Promise.resolve(isLiveOf(actor, file) ? file : null);
  }

  findOwnedFile(actor: Actor, id: string): Promise<File | null> {
    this.journal.add('nodes:findOwnedFile');
    const file = this.files.get(id);
    return Promise.resolve(file?.ownerId === actor.id ? file : null);
  }

  listOwnedFiles(actor: Actor, page: IdPage): Promise<readonly File[]> {
    this.journal.add('nodes:listOwnedFiles');
    const owned = [...this.files.values()]
      .filter(
        (file) => file.ownerId === actor.id && (page.afterId === null || file.id > page.afterId),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return Promise.resolve(owned.slice(0, page.limit));
  }

  lockCurrentVersion(actor: Actor, ref: FileVersionRef): Promise<boolean> {
    this.journal.add('nodes:lockCurrentVersion');
    const file = this.files.get(ref.fileId);
    return Promise.resolve(file?.ownerId === actor.id && file.currentVersionId === ref.versionId);
  }

  findLiveFileByName(actor: Actor, name: FileName, folderId: string | null): Promise<File | null> {
    this.journal.add('nodes:findLiveFileByName');
    const lower = name.value.toLowerCase();
    const found = this.liveFiles(actor).find(
      (file) => file.folderId === folderId && file.name.value.toLowerCase() === lower,
    );
    return Promise.resolve(found ?? null);
  }

  findAccessibleFolder(actor: Actor, id: string): Promise<Folder | null> {
    this.journal.add('nodes:findAccessibleFolder');
    const folder = this.folders.get(id);
    return Promise.resolve(isLiveOf(actor, folder) ? folder : null);
  }

  listContents(actor: Actor, query: NodeListQuery): Promise<NodeListPage> {
    this.journal.add('nodes:listContents');
    this.listed.push(query);
    const folders = this.liveFolders(actor).filter((folder) => folder.parentId === query.folderId);
    const files = this.liveFiles(actor).filter((file) => file.folderId === query.folderId);
    return Promise.resolve({ items: [...folders, ...files], nextCursor: null });
  }

  breadcrumbs(_actor: Actor, folder: Folder): Promise<readonly Folder[]> {
    this.journal.add('nodes:breadcrumbs');
    const ancestors = folder.path.ancestorIds().map((id) => this.folders.get(id));
    return Promise.resolve(ancestors.filter((found): found is Folder => found !== undefined));
  }

  /** Los nombres que la prueba fija como ocupados más los de los archivos vivos del actor en esa carpeta. */
  findTakenNames(
    actor: Actor,
    name: FileName,
    folderId: string | null,
    exceptId?: string,
  ): Promise<readonly string[]> {
    this.journal.add('nodes:findTakenNames');
    this.namesAsked.push(name.value);
    const siblings = this.liveFiles(actor).filter(
      (file) => file.folderId === folderId && file.id !== exceptId,
    );
    return Promise.resolve([...this.taken, ...siblings.map((file) => file.name.value)]);
  }

  findTakenFolderNames(
    actor: Actor,
    name: FolderName,
    parentId: string | null,
    exceptId?: string,
  ): Promise<readonly string[]> {
    this.journal.add('nodes:findTakenFolderNames');
    this.namesAsked.push(name.value);
    const siblings = this.liveFolders(actor).filter(
      (folder) => folder.parentId === parentId && folder.id !== exceptId,
    );
    return Promise.resolve(siblings.map((folder) => folder.name.value));
  }

  maxSubtreeDepth(actor: Actor, folder: Folder): Promise<number> {
    this.journal.add('nodes:maxSubtreeDepth');
    const subtree = this.liveFolders(actor).filter((other) => folder.path.contains(other.path));
    return Promise.resolve(Math.max(folder.depth, ...subtree.map((other) => other.depth)));
  }

  insertWithVersion(_actor: Actor, file: File, version: FileVersion): Promise<void> {
    this.journal.add('nodes:insertWithVersion');
    this.inserted.push({ file, version });
    this.files.set(file.id, file);
    return Promise.resolve();
  }

  updateCurrentVersion(_actor: Actor, file: File): Promise<void> {
    this.journal.add('nodes:updateCurrentVersion');
    this.files.set(file.id, file);
    return Promise.resolve();
  }

  insertFolder(_actor: Actor, folder: Folder): Promise<void> {
    this.journal.add('nodes:insertFolder');
    this.folders.set(folder.id, folder);
    return Promise.resolve();
  }

  renameFolder(_actor: Actor, folder: Folder): Promise<void> {
    this.journal.add('nodes:renameFolder');
    this.folders.set(folder.id, folder);
    return Promise.resolve();
  }

  renameFile(_actor: Actor, file: File): Promise<void> {
    this.journal.add('nodes:renameFile');
    this.files.set(file.id, file);
    return Promise.resolve();
  }

  moveFile(_actor: Actor, file: File): Promise<void> {
    this.journal.add('nodes:moveFile');
    this.files.set(file.id, file);
    return Promise.resolve();
  }

  /** Reubica la ruta de cada carpeta del subárbol de `before`, como el `UPDATE` por prefijo. */
  moveFolderSubtree(_actor: Actor, before: Folder, moved: Folder): Promise<void> {
    this.journal.add('nodes:moveFolderSubtree');
    for (const folder of [...this.folders.values()]) {
      if (folder.id === before.id || !before.path.contains(folder.path)) continue;
      const path = folder.path.rebase(before.path, parentPathOf(moved));
      this.folders.set(folder.id, Folder.rehydrate({ ...folder.snapshot(), path }));
    }
    this.folders.set(moved.id, moved);
    return Promise.resolve();
  }

  private liveFiles(actor: Actor): File[] {
    return [...this.files.values()].filter((file) => isLiveOf(actor, file));
  }

  private liveFolders(actor: Actor): Folder[] {
    return [...this.folders.values()].filter((folder) => isLiveOf(actor, folder));
  }
}

/** Nodo propio del actor y fuera de la papelera (lo que deja ver `accessibleNodes`). */
export function isLiveOf(actor: Actor, node: File | Folder | undefined): node is File | Folder {
  return node !== undefined && node.ownerId === actor.id && node.trash === null;
}

/** Ruta del padre de `folder` (`null` en la raíz). */
function parentPathOf(folder: Folder): FolderPath | null {
  const ancestors = folder.path.ancestorIds();
  return ancestors.length === 0 ? null : FolderPath.of(`/${ancestors.join('/')}/`);
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
  failCopy = false;
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

  /** Como el adaptador real: un origen ausente devuelve `false`; repetir la copia la sobrescribe igual. */
  copyObject(sourceKey: string, targetKey: string): Promise<boolean> {
    this.journal.add('storage:copyObject');
    const source = this.objects.get(sourceKey);
    if (this.failCopy) return Promise.reject(new Error('minio caído'));
    if (source === undefined) return Promise.resolve(false);
    this.objects.set(targetKey, Buffer.from(source));
    return Promise.resolve(true);
  }

  getObjectStream(key: string): Promise<Readable | null> {
    this.journal.add('storage:getObjectStream');
    const object = this.objects.get(key);
    return Promise.resolve(object === undefined ? null : Readable.from([Buffer.from(object)]));
  }

  /** Como el adaptador real, lee el flujo entero; con otro tamaño que el declarado, S3 rechaza. */
  async putObjectStream(key: string, body: Readable, sizeBytes: bigint): Promise<void> {
    this.journal.add('storage:putObjectStream');
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    const content = Buffer.concat(chunks);
    if (BigInt(content.length) !== sizeBytes) throw new Error('IncompleteBody');
    this.objects.set(key, content);
  }

  purgeObject(key: string): Promise<void> {
    this.journal.add('storage:purgeObject');
    if (this.consumeDeleteFailure()) return Promise.reject(new Error('minio caído'));
    this.purged.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** 009: la factura PDF; en memoria, como el resto de objetos del doble. */
  putObject(input: PutObjectInput): Promise<void> {
    this.journal.add('storage:putObject');
    this.objects.set(input.key, input.body);
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

  recordInTransaction(entry: AuditRecord): Promise<void> {
    return this.record(entry);
  }
}

/** Evento publicado por el doble de `IDomainEventPublisher`. */
export interface PublishedEvent {
  readonly name: string;
  readonly payload: object;
}

/** `IDomainEventPublisher` en memoria: anota cada evento (019 RN-11) y nunca lanza, como el real. */
export class FakeDomainEventPublisher implements IDomainEventPublisher {
  readonly published: PublishedEvent[] = [];

  constructor(private readonly journal: Journal) {}

  publish(name: string, payload: object): void {
    this.journal.add(`events:${name}`);
    this.published.push({ name, payload });
  }
}
