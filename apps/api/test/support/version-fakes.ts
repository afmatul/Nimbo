import { randomUUID } from 'node:crypto';

import type { IVersionRepository } from '../../src/modules/storage/application/ports/i-version.repository.port';
import { File } from '../../src/modules/storage/domain/file';
import { FileName } from '../../src/modules/storage/domain/file-name.vo';
import { FileVersion } from '../../src/modules/storage/domain/file-version';
import { ObjectKey } from '../../src/modules/storage/domain/object-key';
import type { Actor } from '../../src/shared';

import type { FakeNodeRepository, FakeObjectStorage, Journal } from './storage-fakes';

/** `version_archivo` en memoria: numera con `MAX + 1` y borra por id, como `TypeOrmVersionRepository`. */
export class FakeVersionRepository implements IVersionRepository {
  readonly versions = new Map<string, FileVersion>();

  constructor(private readonly journal: Journal) {}

  list(_actor: Actor, fileId: string): Promise<readonly FileVersion[]> {
    this.journal.add('versions:list');
    return Promise.resolve(this.of(fileId).sort((a, b) => b.number - a.number));
  }

  find(_actor: Actor, fileId: string, versionId: string): Promise<FileVersion | null> {
    this.journal.add('versions:find');
    const version = this.versions.get(versionId);
    return Promise.resolve(version?.fileId === fileId ? version : null);
  }

  nextNumber(_actor: Actor, fileId: string): Promise<number> {
    this.journal.add('versions:nextNumber');
    return Promise.resolve(Math.max(0, ...this.of(fileId).map((version) => version.number)) + 1);
  }

  insert(_actor: Actor, version: FileVersion): Promise<void> {
    this.journal.add(`versions:insert:${String(version.number)}`);
    this.versions.set(version.id, version);
    return Promise.resolve();
  }

  markKept(_actor: Actor, version: FileVersion): Promise<void> {
    this.journal.add(`versions:markKept:${String(version.number)}`);
    if (this.versions.get(version.id)?.countsInQuota === true) {
      this.versions.set(version.id, version);
    }
    return Promise.resolve();
  }

  delete(_actor: Actor, version: FileVersion): Promise<boolean> {
    this.journal.add(`versions:delete:${String(version.number)}`);
    return Promise.resolve(this.versions.delete(version.id));
  }

  /** Números de las versiones que quedan del archivo, de menor a mayor. */
  numbersOf(fileId: string): number[] {
    return this.of(fileId)
      .map((version) => version.number)
      .sort((a, b) => a - b);
  }

  private of(fileId: string): FileVersion[] {
    return [...this.versions.values()].filter((version) => version.fileId === fileId);
  }
}

/** Dónde se siembra un archivo con historial: sus dobles de árbol, versiones y objetos. */
export interface VersionedFileStores {
  readonly nodes: FakeNodeRepository;
  readonly versions: FakeVersionRepository;
  readonly objects: FakeObjectStorage;
}

const SEEDED_AT = new Date('2026-10-01T10:00:00.000Z');

/** Versión `number` de `fileId`, con su objeto en una clave de UUID (sin nombre, CA-19). */
export const versionOf = (
  owner: Actor,
  fileId: string,
  number: number,
  sizeBytes: bigint,
): FileVersion => {
  const id = randomUUID();
  return FileVersion.fromUpload({
    id,
    fileId,
    objectKey: ObjectKey.of(owner.id, fileId, id),
    sizeBytes,
    createdBy: owner.id,
    number,
    now: SEEDED_AT,
  });
};

/** Archivo vivo de `owner` con las versiones 1…n de `sizes` (la última es la actual) y sus objetos. */
export const seedVersionedFile = (
  stores: VersionedFileStores,
  owner: Actor,
  sizes: readonly bigint[],
): File => {
  const fileId = randomUUID();
  const versions = sizes.map((size, index) => versionOf(owner, fileId, index + 1, size));
  versions.forEach((version) => {
    stores.versions.versions.set(version.id, version);
    stores.objects.objects.set(version.objectKey.value, Buffer.alloc(Number(version.sizeBytes)));
  });
  const current = versions.at(-1);
  if (current === undefined) throw new Error('Un archivo tiene al menos una versión');
  const file = File.create({
    id: fileId,
    ownerId: owner.id,
    folderId: null,
    name: FileName.of('secreto-7f3a.docx'),
    kind: 'docx',
    sizeBytes: current.sizeBytes,
    currentVersionId: current.id,
    now: SEEDED_AT,
  });
  stores.nodes.files.set(file.id, file);
  return file;
};
