import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeNodeRepository,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AccessLevel, PermissionResolver } from '../../access';
import {
  FolderDepthExceededError,
  FolderNameConflictError,
  InvalidMoveError,
  InvalidNodeRequestError,
  NodeNotFoundError,
  AccountReadOnlyError,
} from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';
import { NodeOrder } from '../domain/node-order';
import { TrashState } from '../domain/trash-state';

import type { FolderConfig } from './folder-config';
import { FolderService } from './folder.service';
import { WritableAccountPolicy } from './writable-account.policy';

/** El orden de 006 (sin `sort` ni `dir`, 007 D-6). */
const DEFAULT_ORDER = NodeOrder.of();
const NOW = new Date('2026-09-30T10:00:00.000Z');
const EARLIER = new Date('2026-09-29T10:00:00.000Z');
const MAX_DEPTH = 3;
const CONFIG: FolderConfig = { maxDepth: MAX_DEPTH };
const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const plans = new FakePlanLimitsProvider();
  const service = new FolderService(
    transactions,
    nodes,
    quotas,
    new FixedClock(NOW),
    CONFIG,
    new WritableAccountPolicy(plans),
    new PermissionResolver({
      levelFor: (actor: Actor, nodeId: string) =>
        Promise.resolve(nodes.folders.get(nodeId)?.ownerId === actor.id ? AccessLevel.OWNER : null),
    }),
  );

  /** Carpeta ya guardada de `owner` dentro de `parent` (o en la raíz). */
  const folder = (name: string, parent: Folder | null = null, owner: Actor = ANA): Folder => {
    const created = Folder.create({
      id: randomUUID(),
      ownerId: owner.id,
      name: FolderName.of(name),
      parent,
      maxDepth: MAX_DEPTH,
      now: EARLIER,
    });
    nodes.folders.set(created.id, created);
    return created;
  };

  const file = (name: string, folderId: string | null): File => {
    const created = File.create({
      id: randomUUID(),
      ownerId: ANA.id,
      folderId,
      name: FileName.of(name),
      kind: 'pdf',
      sizeBytes: 10n,
      currentVersionId: randomUUID(),
      now: EARLIER,
    });
    nodes.files.set(created.id, created);
    return created;
  };

  const trash = (target: Folder): void => {
    const trashed = Folder.rehydrate({ ...target.snapshot(), trash: TrashState.start(NOW, 30) });
    nodes.folders.set(target.id, trashed);
  };

  return { journal, nodes, plans, service, folder, file, trash };
}

/** Lo que pasó entre la apertura de la transacción y su cierre, sin las lecturas. */
const writesOf = (journal: Journal): string[] =>
  journal.entries.filter((entry) =>
    /^(tx:|quota:lockUsage|nodes:(insert|rename|move))/.test(entry),
  );

describe('FolderService.create', () => {
  it('CA-1: crea en la raíz una carpeta vacía con id UUID, tras bloquear la fila del dueño', async () => {
    const { service, nodes, journal } = setup();

    const created = await service.create(ANA, { name: '  Proyectos ', parentId: null });

    expect(created.id).toMatch(UUID);
    expect(created.name.value).toBe('Proyectos');
    expect(created.parentId).toBeNull();
    expect(created.depth).toBe(1);
    expect(created.createdAt).toEqual(NOW);
    expect(nodes.folders.get(created.id)).toBe(created);
    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'nodes:insertFolder',
      'tx:end',
    ]);
  });

  it('CA-1: crea dentro de una carpeta propia, con la ruta bajo la del padre', async () => {
    const { service, folder } = setup();
    const parent = folder('Clientes');

    const created = await service.create(ANA, { name: 'Acme', parentId: parent.id });

    expect(created.parentId).toBe(parent.id);
    expect(created.path.value).toBe(`${parent.path.value}${created.id}/`);
  });

  it.each([
    ['vacío', '   ', 'REQUIRED'],
    ['con separador', 'a/b', 'INVALID_NAME'],
    ['largo', 'x'.repeat(256), 'NAME_TOO_LONG'],
  ])('CA-2: un nombre %s es 400 con el campo `name` y no crea nada', async (_, name, reason) => {
    const { service, nodes } = setup();

    const error = await service.create(ANA, { name, parentId: null }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidNodeRequestError);
    expect((error as InvalidNodeRequestError).fields).toEqual([
      expect.objectContaining({ field: 'name', reason }),
    ]);
    expect(nodes.folders.size).toBe(0);
  });

  it('CA-3: una carpeta hermana con el mismo nombre (sin distinguir mayúsculas) es 409 y no crea nada', async () => {
    const { service, nodes, folder } = setup();
    folder('Ñandú');

    await expect(service.create(ANA, { name: 'ñANDÚ', parentId: null })).rejects.toBeInstanceOf(
      FolderNameConflictError,
    );
    expect(nodes.folders.size).toBe(1);
  });

  it('CA-3: un archivo con ese nombre o una carpeta en la papelera no chocan', async () => {
    const { service, folder, file, trash } = setup();
    file('Informes', null);
    trash(folder('Informes'));

    await expect(service.create(ANA, { name: 'Informes', parentId: null })).resolves.toBeInstanceOf(
      Folder,
    );
  });

  it.each([
    ['ajena', (s: ReturnType<typeof setup>): string => s.folder('De Bruno', null, BRUNO).id],
    ['inexistente', (): string => randomUUID()],
    [
      'en la papelera',
      (s: ReturnType<typeof setup>): string => {
        const target = s.folder('Vieja');
        s.trash(target);
        return target.id;
      },
    ],
  ])('CA-5: crear dentro de una carpeta %s es 404', async (_, parentOf) => {
    const s = setup();

    await expect(
      s.service.create(ANA, { name: 'Nueva', parentId: parentOf(s) }),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
  });

  it('CA-9: dentro de una carpeta que ya está a la profundidad máxima es 422 con `maxDepth`', async () => {
    const { service, nodes, folder } = setup();
    const deepest = folder('3', folder('2', folder('1')));

    const error = await service
      .create(ANA, { name: '4', parentId: deepest.id })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FolderDepthExceededError);
    expect((error as FolderDepthExceededError).details).toEqual({ maxDepth: MAX_DEPTH });
    expect(nodes.folders.size).toBe(3);
  });
});

describe('FolderService en solo lectura (spec 010 CA-13, ADR-0032)', () => {
  it('CA-13: crear, renombrar y mover son 403 STORAGE_ACCOUNT_READ_ONLY sin abrir la transacción', async () => {
    const { service, journal, plans, folder } = setup();
    const target = folder('Borrador');
    plans.setReadOnly(true);
    const before = journal.entries.length;

    await expect(service.create(ANA, { name: 'Nueva', parentId: null })).rejects.toBeInstanceOf(
      AccountReadOnlyError,
    );
    await expect(service.rename(ANA, target.id, 'Final')).rejects.toBeInstanceOf(
      AccountReadOnlyError,
    );
    await expect(service.move(ANA, target.id, null)).rejects.toBeInstanceOf(AccountReadOnlyError);
    expect(journal.entries.length).toBe(before);
  });
});

describe('FolderService.rename', () => {
  it('CA-4: guarda el nombre nuevo y la fecha de actualización', async () => {
    const { service, nodes, folder } = setup();
    const target = folder('Borrador');

    const renamed = await service.rename(ANA, target.id, 'Final');

    expect(renamed.name.value).toBe('Final');
    expect(renamed.updatedAt).toEqual(NOW);
    expect(nodes.folders.get(target.id)?.name.value).toBe('Final');
  });

  it('CA-4: cambiar solo mayúsculas no choca consigo misma', async () => {
    const { service, folder } = setup();
    const target = folder('informes');

    await expect(service.rename(ANA, target.id, 'Informes')).resolves.toMatchObject({
      name: FolderName.of('Informes'),
    });
  });

  it('CA-3: el nombre de una hermana es 409', async () => {
    const { service, nodes, folder } = setup();
    folder('Fotos');
    const target = folder('Videos');

    await expect(service.rename(ANA, target.id, 'FOTOS')).rejects.toBeInstanceOf(
      FolderNameConflictError,
    );
    expect(nodes.folders.get(target.id)?.name.value).toBe('Videos');
  });

  it('CA-2: un nombre inválido es 400', async () => {
    const { service, folder } = setup();

    await expect(service.rename(ANA, folder('A').id, '..')).rejects.toBeInstanceOf(
      InvalidNodeRequestError,
    );
  });

  it('CA-5: una carpeta ajena es 404', async () => {
    const { service, folder } = setup();

    await expect(
      service.rename(ANA, folder('De Bruno', null, BRUNO).id, 'Mía'),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});

describe('FolderService.move', () => {
  it('CA-7: mueve la carpeta con su subárbol, tras bloquear la fila del dueño', async () => {
    const { service, nodes, journal, folder } = setup();
    const source = folder('Origen');
    const destination = folder('Destino');
    const child = folder('Hija', source);

    const moved = await service.move(ANA, source.id, destination.id);

    expect(moved.parentId).toBe(destination.id);
    expect(moved.path.value).toBe(`${destination.path.value}${source.id}/`);
    expect(moved.updatedAt).toEqual(NOW);
    expect(nodes.folders.get(child.id)?.path.value).toBe(`${moved.path.value}${child.id}/`);
    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'nodes:moveFolderSubtree',
      'tx:end',
    ]);
  });

  it('CA-7: mueve a la raíz con `parentId: null`', async () => {
    const { service, folder } = setup();
    const source = folder('Hija', folder('Madre'));

    const moved = await service.move(ANA, source.id, null);

    expect(moved.parentId).toBeNull();
    expect(moved.path.value).toBe(`/${source.id}/`);
  });

  it('CA-7: mover a la carpeta en que ya está no choca consigo misma', async () => {
    const { service, folder } = setup();
    const parent = folder('Madre');
    const source = folder('Hija', parent);

    await expect(service.move(ANA, source.id, parent.id)).resolves.toMatchObject({
      parentId: parent.id,
    });
  });

  it.each([
    ['sí misma', (source: Folder): Folder => source],
    ['una descendiente', (_: Folder, grandchild: Folder): Folder => grandchild],
  ])('CA-8: mover dentro de %s es 422 y nada cambia', async (_, destinationOf) => {
    const { service, nodes, folder } = setup();
    const source = folder('Origen');
    const grandchild = folder('Nieta', folder('Hija', source));

    await expect(
      service.move(ANA, source.id, destinationOf(source, grandchild).id),
    ).rejects.toBeInstanceOf(InvalidMoveError);
    expect(nodes.folders.get(source.id)).toBe(source);
  });

  it('CA-9: si el subárbol quedaría por debajo de la profundidad máxima es 422', async () => {
    const { service, folder } = setup();
    const source = folder('Origen');
    folder('Hija', source);
    const destination = folder('2', folder('1'));

    await expect(service.move(ANA, source.id, destination.id)).rejects.toBeInstanceOf(
      FolderDepthExceededError,
    );
  });

  it('CA-3: una carpeta con ese nombre en el destino es 409 y no se fusiona', async () => {
    const { service, nodes, folder } = setup();
    const destination = folder('Destino');
    folder('informes', destination);
    const source = folder('Informes');

    await expect(service.move(ANA, source.id, destination.id)).rejects.toBeInstanceOf(
      FolderNameConflictError,
    );
    expect(nodes.folders.get(source.id)?.parentId).toBeNull();
  });

  it('CA-5: un destino ajeno es 404, como uno inexistente', async () => {
    const { service, folder } = setup();
    const source = folder('Mía');

    await expect(
      service.move(ANA, source.id, folder('De Bruno', null, BRUNO).id),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
    await expect(service.move(ANA, randomUUID(), null)).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});

describe('FolderService.contents', () => {
  it('CA-5: la raíz no tiene carpeta ni migas y lista lo que está en ella', async () => {
    const { service, nodes, folder, file } = setup();
    const top = folder('Arriba');
    folder('Abajo', top);
    const loose = file('suelto.pdf', null);

    const contents = await service.contents(ANA, {
      folderId: null,
      order: DEFAULT_ORDER,
      limit: 20,
    });

    expect(contents.folder).toBeNull();
    expect(contents.breadcrumbs).toEqual([]);
    expect(contents.accessLevel).toBe(AccessLevel.OWNER);
    expect(contents.page.items.map((node) => node.id)).toEqual([top.id, loose.id]);
    expect(nodes.listed).toEqual([{ folderId: null, order: DEFAULT_ORDER, limit: 20 }]);
  });

  it('CA-5: una carpeta trae sus migas desde la raíz hasta ella y pasa el cursor', async () => {
    const { service, nodes, folder } = setup();
    const first = folder('Uno');
    const second = folder('Dos', first);
    const third = folder('Tres', second);

    const contents = await service.contents(ANA, {
      folderId: third.id,
      order: DEFAULT_ORDER,
      cursor: 'c',
      limit: 5,
    });

    expect(contents.folder?.id).toBe(third.id);
    expect(contents.accessLevel).toBe(AccessLevel.OWNER);
    expect(contents.breadcrumbs.map((crumb) => crumb.id)).toEqual([first.id, second.id, third.id]);
    expect(nodes.listed).toEqual([
      { folderId: third.id, order: DEFAULT_ORDER, cursor: 'c', limit: 5 },
    ]);
  });

  it('CA-5: una carpeta en la papelera es 404 y no se lista', async () => {
    const { service, nodes, folder, trash } = setup();
    const target = folder('Vieja');
    trash(target);

    await expect(
      service.contents(ANA, { folderId: target.id, order: DEFAULT_ORDER, limit: 5 }),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(nodes.listed).toEqual([]);
  });
});
