import { randomUUID } from 'node:crypto';

import {
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeTrashRepository } from '../../../../test/support/trash-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';
import { ObjectKey } from '../domain/object-key';
import { TrashState } from '../domain/trash-state';

import { TrashPurger } from './trash-purger';

const DELETED_AT = new Date('2026-09-01T10:00:00.000Z');
const RETENTION_DAYS = 30;
const PURGE_AT = new Date('2026-10-01T10:00:00.000Z');
const BEFORE_PURGE = new Date('2026-09-30T10:00:00.000Z');
const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const trash = new FakeTrashRepository(journal, nodes);
  const objects = new FakeObjectStorage(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const purger = new TrashPurger(transactions, trash, quotas, objects, logger);
  const state = TrashState.start(DELETED_AT, RETENTION_DAYS);

  const trashedFolder = (): Folder => {
    const folder = Folder.create({
      id: randomUUID(),
      ownerId: ANA.id,
      name: FolderName.of('Proyectos'),
      parent: null,
      maxDepth: 10,
      now: DELETED_AT,
    });
    const trashed = Folder.rehydrate({ ...folder.snapshot(), trash: state });
    nodes.folders.set(trashed.id, trashed);
    return trashed;
  };

  const trashedFile = (sizeBytes: bigint, carrier: Folder | null = null): File => {
    const file = File.create({
      id: randomUUID(),
      ownerId: ANA.id,
      folderId: carrier?.id ?? null,
      name: FileName.of('secreto-7f3a.pdf'),
      kind: 'pdf',
      sizeBytes,
      currentVersionId: randomUUID(),
      now: DELETED_AT,
    });
    const trash = carrier === null ? state : state.carriedBy(carrier.id);
    const trashed = File.rehydrate({ ...file.snapshot(), trash });
    nodes.files.set(trashed.id, trashed);
    return trashed;
  };

  const keyOf = (file: File): string =>
    ObjectKey.of(file.ownerId, file.id, file.currentVersionId).value;

  return { journal, nodes, quotas, objects, logger, purger, trashedFolder, trashedFile, keyOf };
}

/** Lo que cambia el estado, en orden. */
const writesOf = (journal: Journal): string[] =>
  journal.entries.filter((entry) =>
    /^(tx:|quota:(lockUsage|addUsedBytes)|storage:purgeObject|trash:delete)/.test(entry),
  );

describe('TrashPurger (plan 006 §1, CA-18 a CA-20)', () => {
  it('CA-18: purga un archivo bajo el bloqueo del dueño: objetos → filas → `espacio_usado`', async () => {
    const { purger, journal, quotas, objects, nodes, trashedFile, keyOf } = setup();
    const file = trashedFile(42n);

    const report = await purger.purge(ANA, { type: 'file', id: file.id }, null);

    expect(report).toEqual({ freedBytes: 42n, itemCount: 1, failedFiles: 0 });
    expect(objects.purged).toEqual([keyOf(file)]);
    expect(nodes.files.has(file.id)).toBe(false);
    expect(quotas.added).toEqual([-42n]);
    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'storage:purgeObject',
      `trash:deleteFileRows:${file.id}`,
      'quota:addUsedBytes',
      'tx:end',
    ]);
  });

  it('CA-18, CA-19: una carpeta purga cada archivo que arrastró y borra las carpetas al final', async () => {
    const { purger, journal, quotas, nodes, trashedFolder, trashedFile } = setup();
    const folder = trashedFolder();
    const first = trashedFile(300n, folder);
    const second = trashedFile(700n, folder);

    const report = await purger.purge(ANA, { type: 'folder', id: folder.id }, null);

    expect(report).toEqual({ freedBytes: 1000n, itemCount: 3, failedFiles: 0 });
    expect(quotas.added).toEqual([-300n, -700n]);
    expect(nodes.folders.has(folder.id)).toBe(false);
    expect(writesOf(journal).at(-2)).toBe(`trash:deleteFolderRows:${folder.id}`);
    expect(writesOf(journal)).toContain(`trash:deleteFileRows:${first.id}`);
    expect(writesOf(journal)).toContain(`trash:deleteFileRows:${second.id}`);
  });

  it('CA-20: si falla el borrado de un objeto, su fila y `espacio_usado` no cambian', async () => {
    const { purger, journal, quotas, objects, nodes, trashedFile } = setup();
    const file = trashedFile(42n);
    objects.deleteFailures = 1;

    const report = await purger.purge(ANA, { type: 'file', id: file.id }, null);

    expect(report).toEqual({ freedBytes: 0n, itemCount: 0, failedFiles: 1 });
    expect(nodes.files.has(file.id)).toBe(true);
    expect(quotas.added).toEqual([]);
    expect(journal.entries.filter((entry) => entry.startsWith('trash:delete'))).toEqual([]);
  });

  it('CA-20: en una carpeta, el archivo que falla se queda y la carpeta no se borra; los demás sí', async () => {
    const { purger, quotas, objects, nodes, trashedFolder, trashedFile } = setup();
    const folder = trashedFolder();
    const failing = trashedFile(300n, folder);
    const purged = trashedFile(700n, folder);
    objects.deleteFailures = 1;

    const report = await purger.purge(ANA, { type: 'folder', id: folder.id }, null);

    expect(report).toEqual({ freedBytes: 700n, itemCount: 1, failedFiles: 1 });
    expect(nodes.files.has(failing.id)).toBe(true);
    expect(nodes.files.has(purged.id)).toBe(false);
    expect(nodes.folders.has(folder.id)).toBe(true);
    expect(quotas.added).toEqual([-700n]);
  });

  it('CA-20: el fallo se registra con el UUID y el nombre del error, sin nombres ni claves', async () => {
    const { purger, objects, logger, trashedFile } = setup();
    const file = trashedFile(42n);
    objects.deleteFailures = 1;

    await purger.purge(ANA, { type: 'file', id: file.id }, null);

    expect(logger.error).toHaveBeenCalledWith({
      event: 'trash.purge_failed',
      nodeId: file.id,
      errorName: 'Error',
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/secreto|u\//);
  });

  it('CA-20: el reintento termina lo que faltó (idempotente) y la segunda pasada no encuentra nada', async () => {
    const { purger, quotas, objects, nodes, trashedFolder, trashedFile } = setup();
    const folder = trashedFolder();
    trashedFile(300n, folder);
    trashedFile(700n, folder);
    objects.deleteFailures = 1;
    await purger.purge(ANA, { type: 'folder', id: folder.id }, null);

    const retried = await purger.purge(ANA, { type: 'folder', id: folder.id }, null);
    const again = await purger.purge(ANA, { type: 'folder', id: folder.id }, null);

    expect(retried).toEqual({ freedBytes: 300n, itemCount: 2, failedFiles: 0 });
    expect(again).toBeNull();
    expect(nodes.folders.has(folder.id)).toBe(false);
    expect(quotas.added.reduce((sum, delta) => sum + delta, 0n)).toBe(-1000n);
  });

  it('CA-16, CA-22: lo ajeno, inexistente o vivo no se purga (`null`) y no toca objetos', async () => {
    const { purger, objects, trashedFile } = setup();
    const file = trashedFile(42n);

    await expect(purger.purge(BRUNO, { type: 'file', id: file.id }, null)).resolves.toBeNull();
    await expect(purger.purge(ANA, { type: 'file', id: randomUUID() }, null)).resolves.toBeNull();
    await expect(purger.purge(ANA, { type: 'folder', id: file.id }, null)).resolves.toBeNull();
    expect(objects.purged).toEqual([]);
  });

  it('CA-19: con `dueBy`, lo que todavía no vence no se toca', async () => {
    const { purger, objects, nodes, trashedFile } = setup();
    const file = trashedFile(42n);

    const early = await purger.purge(ANA, { type: 'file', id: file.id }, BEFORE_PURGE);
    const due = await purger.purge(ANA, { type: 'file', id: file.id }, PURGE_AT);

    expect(early).toBeNull();
    expect(due).toEqual({ freedBytes: 42n, itemCount: 1, failedFiles: 0 });
    expect(objects.purged).toHaveLength(1);
    expect(nodes.files.has(file.id)).toBe(false);
  });
});
