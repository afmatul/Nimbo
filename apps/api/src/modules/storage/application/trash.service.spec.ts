import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeTrashRepository } from '../../../../test/support/trash-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import { FolderDepthExceededError, NodeNotFoundError } from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';

import type { FolderConfig } from './folder-config';
import type { ITrashPurgeQueue } from './ports/i-trash-purge-queue.port';
import { TrashPurgeIncompleteError, TrashPurger } from './trash-purger';
import { TrashService } from './trash.service';

const NOW = new Date('2026-09-30T10:00:00.000Z');
const EARLIER = new Date('2026-09-20T10:00:00.000Z');
const DAY_MS = 86_400_000;
const RETENTION_DAYS = 30;
const MAX_DEPTH = 3;
const CONFIG: FolderConfig = { maxDepth: MAX_DEPTH };
const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);

const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

/** Cola `trash-purge` en memoria; con `fails` rechaza como Redis caído. */
class FakeTrashPurgeQueue implements ITrashPurgeQueue {
  enqueued = 0;
  fails = false;

  constructor(private readonly journal: Journal) {}

  enqueueNow(): Promise<void> {
    this.journal.add('queue:enqueueNow');
    if (this.fails) return Promise.reject(new Error('redis caído'));
    this.enqueued += 1;
    return Promise.resolve();
  }
}

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const trash = new FakeTrashRepository(journal, nodes);
  const audit = new FakeAuditLogger(journal);
  const plans = new FakePlanLimitsProvider({
    maxFileBytes: 100n,
    storageQuotaBytes: 1000n,
    trashRetentionDays: RETENTION_DAYS,
    retainedVersions: 3,
    maxEditors: 0,
    planName: 'Plan de prueba',
  });
  const objects = new FakeObjectStorage(journal);
  const clock = new FixedClock(NOW);
  const purgeQueue = new FakeTrashPurgeQueue(journal);
  const service = new TrashService(
    transactions,
    nodes,
    trash,
    quotas,
    plans,
    audit,
    clock,
    CONFIG,
    silentLogger,
    new TrashPurger(transactions, trash, quotas, objects, silentLogger),
    purgeQueue,
  );

  const folder = (name: string, parent: Folder | null = null, owner: Actor = ANA): Folder => {
    const created = Folder.create({
      id: randomUUID(),
      ownerId: owner.id,
      name: FolderName.of(name),
      parent,
      maxDepth: 10,
      now: EARLIER,
    });
    nodes.folders.set(created.id, created);
    return created;
  };

  const file = (name: string, parent: Folder | null = null, sizeBytes = 10n): File => {
    const created = File.create({
      id: randomUUID(),
      ownerId: ANA.id,
      folderId: parent?.id ?? null,
      name: FileName.of(name),
      kind: 'pdf',
      sizeBytes,
      currentVersionId: randomUUID(),
      now: EARLIER,
    });
    nodes.files.set(created.id, created);
    return created;
  };

  return {
    journal,
    nodes,
    trash,
    audit,
    plans,
    quotas,
    objects,
    clock,
    purgeQueue,
    service,
    folder,
    file,
  };
}

/** Lo que cambia el estado, en orden, sin las lecturas. */
const writesOf = (journal: Journal): string[] =>
  journal.entries.filter((entry) =>
    /^(tx:|quota:lockUsage|trash:(mark|restore)|audit:)/.test(entry),
  );

describe('TrashService.trashFile', () => {
  it('CA-10, CA-19: manda el archivo a la papelera con la purga a la retención del plan, bajo el bloqueo del dueño', async () => {
    const { service, nodes, journal, folder, file } = setup();
    const parent = folder('Informes');
    const target = file('enero.pdf', parent, 42n);

    const entry = await service.trashFile(ANA, target.id);

    expect(entry).toMatchObject({
      id: target.id,
      type: 'file',
      kind: 'pdf',
      sizeBytes: 42n,
      originalFolder: { id: parent.id, name: 'Informes' },
      deletedAt: NOW,
      purgeAt: new Date(NOW.getTime() + RETENTION_DAYS * DAY_MS),
    });
    expect(nodes.files.get(target.id)?.trash?.isTrashRoot).toBe(true);
    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'trash:markFileTrashed',
      'tx:end',
      'audit:node.trashed',
    ]);
  });

  it('CA-24: audita `node.trashed` con tipo, cantidad y bytes, sin nombres', async () => {
    const { service, audit, file } = setup();
    const target = file('privado.pdf', null, 42n);

    await service.trashFile(ANA, target.id);

    expect(audit.records).toEqual([
      {
        action: AuditAction.NODE_TRASHED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: target.id,
        attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 42 },
      },
    ]);
    expect(JSON.stringify(audit.records)).not.toContain('privado');
  });

  it('CA-24: si la auditoría falla, el archivo queda en la papelera igual', async () => {
    const { service, audit, nodes, file } = setup();
    const target = file('enero.pdf');
    audit.fails = true;

    await service.trashFile(ANA, target.id);

    expect(nodes.files.get(target.id)?.trash).not.toBeNull();
  });

  it('CA-16, CA-22: un archivo ajeno, inexistente o ya en la papelera es 404 y no se marca nada', async () => {
    const { service, journal, file } = setup();
    const target = file('enero.pdf');
    await service.trashFile(ANA, target.id);
    journal.entries.length = 0;

    await expect(service.trashFile(BRUNO, target.id)).rejects.toBeInstanceOf(NodeNotFoundError);
    await expect(service.trashFile(ANA, target.id)).rejects.toBeInstanceOf(NodeNotFoundError);
    await expect(service.trashFile(ANA, randomUUID())).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(journal.entries.filter((entry) => entry.startsWith('trash:mark'))).toEqual([]);
  });
});

describe('TrashService.trashFolder', () => {
  it('CA-11: la carpeta es un solo elemento con la suma de su contenido; el subárbol viaja con ella', async () => {
    const { service, nodes, audit, folder, file } = setup();
    const root = folder('Proyectos');
    const child = folder('Acme', root);
    const inRoot = file('a.pdf', root, 5n);
    const inChild = file('b.pdf', child, 7n);

    const entry = await service.trashFolder(ANA, root.id);

    expect(entry).toMatchObject({ id: root.id, type: 'folder', kind: null, sizeBytes: 12n });
    expect(nodes.folders.get(child.id)?.trash?.trashedWithFolderId).toBe(root.id);
    expect(nodes.files.get(inRoot.id)?.trash?.trashedWithFolderId).toBe(root.id);
    expect(nodes.files.get(inChild.id)?.trash?.deletedAt).toEqual(NOW);
    expect(audit.records[0]).toMatchObject({
      action: AuditAction.NODE_TRASHED,
      resourceId: root.id,
      attributes: { nodeType: 'folder', itemCount: 4, sizeBytes: 12 },
    });
  });

  it('CA-16: una carpeta ajena es 404', async () => {
    const { service, folder } = setup();
    const foreign = folder('Ajena', null, BRUNO);

    await expect(service.trashFolder(ANA, foreign.id)).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});

describe('TrashService.restoreFile', () => {
  it('CA-13: vuelve a su carpeta original con su nombre', async () => {
    const { service, nodes, audit, folder, file } = setup();
    const parent = folder('Informes');
    const target = file('enero.pdf', parent);
    await service.trashFile(ANA, target.id);

    const result = await service.restoreFile(ANA, target.id);

    expect(result).toMatchObject({ outcome: 'restored', originalName: 'enero.pdf' });
    const restored = nodes.files.get(target.id);
    expect(restored).toMatchObject({ folderId: parent.id, trash: null });
    expect(restored?.updatedAt).toEqual(NOW);
    expect(audit.records.at(-1)).toMatchObject({
      action: AuditAction.NODE_RESTORED,
      resourceId: target.id,
      attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 10 },
    });
  });

  it('CA-14: si ya hay otro con ese nombre, vuelve como «nombre (n)»', async () => {
    const { service, file } = setup();
    const target = file('enero.pdf');
    await service.trashFile(ANA, target.id);
    file('enero.pdf');
    file('enero (1).pdf');

    const result = await service.restoreFile(ANA, target.id);

    expect(result.outcome).toBe('renamed');
    expect(result.node.name.value).toBe('enero (2).pdf');
    expect(result.originalName).toBe('enero.pdf');
  });

  it('CA-15: si la carpeta original está en la papelera, vuelve a la raíz', async () => {
    const { service, nodes, folder, file } = setup();
    const parent = folder('Informes');
    const target = file('enero.pdf', parent);
    await service.trashFile(ANA, target.id);
    await service.trashFolder(ANA, parent.id);

    const result = await service.restoreFile(ANA, target.id);

    expect(result.outcome).toBe('moved_to_root');
    expect(nodes.files.get(target.id)?.folderId).toBeNull();
  });

  it('CA-16: un archivo vivo, ajeno o arrastrado por una carpeta no se restaura por sí mismo (404)', async () => {
    const { service, folder, file } = setup();
    const live = file('vivo.pdf');
    const parent = folder('Informes');
    const carried = file('dentro.pdf', parent);
    await service.trashFolder(ANA, parent.id);
    const own = file('propio.pdf');
    await service.trashFile(ANA, own.id);

    await expect(service.restoreFile(ANA, live.id)).rejects.toBeInstanceOf(NodeNotFoundError);
    await expect(service.restoreFile(ANA, carried.id)).rejects.toBeInstanceOf(NodeNotFoundError);
    await expect(service.restoreFile(BRUNO, own.id)).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});

describe('TrashService.restoreFolder', () => {
  it('CA-13: vuelve con lo que arrastró; lo eliminado antes por separado sigue en la papelera', async () => {
    const { service, nodes, audit, folder, file } = setup();
    const root = folder('Proyectos');
    const child = folder('Acme', root);
    const carried = file('a.pdf', child);
    const apart = file('aparte.pdf', root);
    await service.trashFile(ANA, apart.id);
    await service.trashFolder(ANA, root.id);

    const result = await service.restoreFolder(ANA, root.id);

    expect(result).toMatchObject({ outcome: 'restored', originalName: 'Proyectos' });
    expect(nodes.folders.get(root.id)?.trash).toBeNull();
    expect(nodes.folders.get(child.id)?.trash).toBeNull();
    expect(nodes.files.get(carried.id)?.trash).toBeNull();
    expect(nodes.files.get(apart.id)?.trash?.isTrashRoot).toBe(true);
    expect(audit.records.at(-1)).toMatchObject({
      action: AuditAction.NODE_RESTORED,
      attributes: { nodeType: 'folder', itemCount: 3, sizeBytes: 10 },
    });
  });

  it('CA-14: si ya hay otra carpeta con ese nombre, vuelve como «nombre (n)»', async () => {
    const { service, folder } = setup();
    const target = folder('Fotos');
    await service.trashFolder(ANA, target.id);
    folder('fotos');

    const result = await service.restoreFolder(ANA, target.id);

    expect(result.outcome).toBe('renamed');
    expect(result.node.name.value).toBe('Fotos (1)');
  });

  it('CA-15: si la carpeta original está en la papelera, vuelve a la raíz y su subárbol se reubica', async () => {
    const { service, nodes, folder } = setup();
    const parent = folder('Clientes');
    const target = folder('Acme', parent);
    const child = folder('2026', target);
    await service.trashFolder(ANA, target.id);
    await service.trashFolder(ANA, parent.id);

    const result = await service.restoreFolder(ANA, target.id);

    expect(result.outcome).toBe('moved_to_root');
    const restored = nodes.folders.get(target.id);
    expect(restored).toMatchObject({ parentId: null, depth: 1 });
    expect(nodes.folders.get(child.id)?.path.value).toBe(`/${target.id}/${child.id}/`);
  });

  it('R-5: si la carpeta original se purgó, vuelve a la raíz aunque la ruta guardada conserve ancestros', async () => {
    const { service, trash, nodes, folder } = setup();
    const parent = folder('Clientes');
    const target = folder('Acme', parent);
    await service.trashFolder(ANA, target.id);
    trash.orphans.add(target.id);
    nodes.folders.delete(parent.id);

    const result = await service.restoreFolder(ANA, target.id);

    expect(result.node).toMatchObject({ parentId: null, depth: 1 });
    expect(nodes.folders.get(target.id)?.path.value).toBe(`/${target.id}/`);
  });

  it('CA-15: si volver a su lugar supera la profundidad máxima, 422 y nada cambia', async () => {
    const { service, nodes, journal, folder } = setup();
    const top = folder('Uno');
    const target = folder('Dos', top);
    folder('Tres', target);
    await service.trashFolder(ANA, target.id);
    const deeper = folder('Cero');
    const movedTop = Folder.rehydrate({
      ...top.snapshot(),
      parentId: deeper.id,
      path: top.path.rebase(top.path, deeper.path),
    });
    await nodes.moveFolderSubtree(ANA, top, movedTop);
    journal.entries.length = 0;

    const restoring = service.restoreFolder(ANA, target.id);

    await expect(restoring).rejects.toBeInstanceOf(FolderDepthExceededError);
    await expect(restoring).rejects.toMatchObject({ details: { maxDepth: MAX_DEPTH } });
    expect(nodes.folders.get(target.id)?.trash).not.toBeNull();
    expect(journal.entries).not.toContain('trash:restoreFolderSubtree');
  });

  it('CA-16: una carpeta ajena o viva es 404', async () => {
    const { service, folder } = setup();
    const live = folder('Viva');
    const foreign = folder('Ajena', null, BRUNO);
    await service.trashFolder(BRUNO, foreign.id);

    await expect(service.restoreFolder(ANA, live.id)).rejects.toBeInstanceOf(NodeNotFoundError);
    await expect(service.restoreFolder(ANA, foreign.id)).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});

describe('TrashService.list y summary', () => {
  it('CA-12: lista las raíces de la papelera y resume cantidad, bytes y la retención del plan', async () => {
    const { service, folder, file } = setup();
    const root = folder('Proyectos');
    file('a.pdf', root, 5n);
    const loose = file('b.pdf', null, 7n);
    await service.trashFolder(ANA, root.id);
    await service.trashFile(ANA, loose.id);

    const page = await service.list(ANA, { limit: 10 });
    const summary = await service.summary(ANA);

    expect(page.items.map((item) => item.id).sort()).toEqual([root.id, loose.id].sort());
    expect(summary).toEqual({ itemCount: 2, totalBytes: 12n, retentionDays: RETENTION_DAYS });
  });

  it('CA-19: la fecha de purga queda fijada aunque luego cambie el plan', async () => {
    const { service, plans, file } = setup();
    const target = file('a.pdf');
    await service.trashFile(ANA, target.id);
    plans.setLimits({
      planName: 'Plan de prueba',
      maxFileBytes: 100n,
      storageQuotaBytes: 1000n,
      trashRetentionDays: 7,
      retainedVersions: 3,
      maxEditors: 0,
    });

    const page = await service.list(ANA, { limit: 10 });

    expect(page.items[0]?.purgeAt).toEqual(new Date(NOW.getTime() + RETENTION_DAYS * DAY_MS));
  });
});

describe('TrashService: nombres al restaurar', () => {
  it('RN-4: lo que está en la papelera no ocupa nombre al restaurar otro con el mismo', async () => {
    const { service, file } = setup();
    const first = file('enero.pdf');
    await service.trashFile(ANA, first.id);
    const second = file('enero.pdf');
    await service.trashFile(ANA, second.id);

    const result = await service.restoreFile(ANA, first.id);

    expect(result.outcome).toBe('restored');
  });
});

describe('TrashService.purge (eliminar definitivamente)', () => {
  it('CA-18: purga el archivo al momento, devuelve los bytes liberados y baja `espacio_usado`', async () => {
    const { service, nodes, quotas, file } = setup();
    const target = file('enero.pdf', null, 42n);
    await service.trashFile(ANA, target.id);

    const freed = await service.purge(ANA, { type: 'file', id: target.id });

    expect(freed).toBe(42n);
    expect(nodes.files.has(target.id)).toBe(false);
    expect(quotas.added).toEqual([-42n]);
  });

  it('CA-18: una carpeta se purga con todo lo que arrastró', async () => {
    const { service, nodes, folder, file } = setup();
    const root = folder('Proyectos');
    const child = folder('Acme', root);
    file('a.pdf', root, 5n);
    file('b.pdf', child, 7n);
    await service.trashFolder(ANA, root.id);

    const freed = await service.purge(ANA, { type: 'folder', id: root.id });

    expect(freed).toBe(12n);
    expect(nodes.files.size).toBe(0);
    expect(nodes.folders.size).toBe(0);
  });

  it('CA-16, CA-22: un elemento inexistente, ajeno, vivo o ya purgado es 404', async () => {
    const { service, file } = setup();
    const target = file('enero.pdf');
    const live = file('vivo.pdf');
    await service.trashFile(ANA, target.id);
    await service.purge(ANA, { type: 'file', id: target.id });

    await expect(service.purge(ANA, { type: 'file', id: target.id })).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
    await expect(service.purge(BRUNO, { type: 'file', id: live.id })).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
    await expect(service.purge(ANA, { type: 'file', id: live.id })).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
  });

  it('CA-24: audita `node.purged` (manual) con tipo, cantidad y bytes, sin nombres', async () => {
    const { service, audit, folder, file } = setup();
    const root = folder('Privado');
    file('secreto.pdf', root, 9n);
    await service.trashFolder(ANA, root.id);

    await service.purge(ANA, { type: 'folder', id: root.id });

    expect(audit.records.at(-1)).toEqual({
      action: AuditAction.NODE_PURGED,
      actor: ANA,
      targetUserId: ANA.id,
      resourceId: root.id,
      attributes: { nodeType: 'folder', itemCount: 2, sizeBytes: 9, trigger: 'manual' },
    });
    expect(JSON.stringify(audit.records)).not.toMatch(/Privado|secreto/);
  });

  it('CA-20: si un objeto falla, el archivo sigue en la papelera y la purga falla para reintentarse', async () => {
    const { service, nodes, quotas, objects, file } = setup();
    const target = file('enero.pdf', null, 42n);
    await service.trashFile(ANA, target.id);
    objects.deleteFailures = 1;

    await expect(service.purge(ANA, { type: 'file', id: target.id })).rejects.toBeInstanceOf(
      TrashPurgeIncompleteError,
    );
    expect(nodes.files.get(target.id)?.trash).not.toBeNull();
    expect(quotas.added).toEqual([]);
  });
});

describe('TrashService.purgeExpired (purga programada)', () => {
  it('CA-19: antes de la fecha de purga no toca nada; al vencer purga y audita `scheduled`', async () => {
    const { service, nodes, audit, clock, file } = setup();
    const target = file('enero.pdf', null, 42n);
    await service.trashFile(ANA, target.id);

    await service.purgeExpired(ANA, { type: 'file', id: target.id });
    expect(nodes.files.has(target.id)).toBe(true);

    clock.set(new Date(NOW.getTime() + RETENTION_DAYS * DAY_MS));
    await service.purgeExpired(ANA, { type: 'file', id: target.id });

    expect(nodes.files.has(target.id)).toBe(false);
    expect(audit.records.at(-1)).toMatchObject({
      action: AuditAction.NODE_PURGED,
      attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 42, trigger: 'scheduled' },
    });
  });

  it('CA-20: idempotente: lo ya purgado o restaurado no hace nada ni audita', async () => {
    const { service, audit, clock, file } = setup();
    const target = file('enero.pdf');
    await service.trashFile(ANA, target.id);
    await service.restoreFile(ANA, target.id);
    clock.set(new Date(NOW.getTime() + RETENTION_DAYS * DAY_MS));
    const before = audit.records.length;

    await service.purgeExpired(ANA, { type: 'file', id: target.id });
    await service.purgeExpired(ANA, { type: 'file', id: randomUUID() });

    expect(audit.records).toHaveLength(before);
  });

  it('CA-20: un objeto que falla deja el elemento y lanza para que el trabajo se reintente', async () => {
    const { service, objects, clock, file } = setup();
    const target = file('enero.pdf');
    await service.trashFile(ANA, target.id);
    clock.set(new Date(NOW.getTime() + RETENTION_DAYS * DAY_MS));
    objects.deleteFailures = 1;

    await expect(service.purgeExpired(ANA, { type: 'file', id: target.id })).rejects.toBeInstanceOf(
      TrashPurgeIncompleteError,
    );
  });
});

describe('TrashService.empty (vaciar papelera)', () => {
  it('CA-18: fija la purga en «ahora» en todas las raíces, encola el trabajo y no purga en la petición', async () => {
    const { service, nodes, quotas, journal, purgeQueue, folder, file } = setup();
    const root = folder('Proyectos');
    file('a.pdf', root, 5n);
    const loose = file('b.pdf', null, 7n);
    await service.trashFolder(ANA, root.id);
    await service.trashFile(ANA, loose.id);

    const result = await service.empty(ANA);

    expect(result).toEqual({ itemCount: 2, totalBytes: 12n });
    expect(nodes.files.get(loose.id)?.trash?.purgeAt).toEqual(NOW);
    expect(nodes.folders.get(root.id)?.trash?.purgeAt).toEqual(NOW);
    expect(quotas.added).toEqual([]);
    expect(purgeQueue.enqueued).toBe(1);
    expect(journal.indexOf('queue:enqueueNow')).toBeGreaterThan(
      journal.entries.lastIndexOf('tx:end'),
    );
  });

  it('CA-24: audita `trash.emptied` con cantidad y bytes, sin nombres', async () => {
    const { service, audit, file } = setup();
    const loose = file('privado.pdf', null, 7n);
    await service.trashFile(ANA, loose.id);

    await service.empty(ANA);

    expect(audit.records.at(-1)).toEqual({
      action: AuditAction.TRASH_EMPTIED,
      actor: ANA,
      targetUserId: ANA.id,
      attributes: { itemCount: 1, sizeBytes: 7 },
    });
  });

  it('CA-18: con la papelera vacía no encola ni audita', async () => {
    const { service, audit, purgeQueue } = setup();

    await expect(service.empty(ANA)).resolves.toEqual({ itemCount: 0, totalBytes: 0n });
    expect(purgeQueue.enqueued).toBe(0);
    expect(audit.records).toEqual([]);
  });

  it('CA-18: si encolar falla, responde igual: el ciclo programado purgará lo vencido', async () => {
    const { service, purgeQueue, file } = setup();
    const loose = file('b.pdf', null, 7n);
    await service.trashFile(ANA, loose.id);
    purgeQueue.fails = true;

    await expect(service.empty(ANA)).resolves.toEqual({ itemCount: 1, totalBytes: 7n });
  });
});
