import { randomUUID } from 'node:crypto';

import { FakeQuickAccessRepository } from '../../../../test/support/quick-access-fakes';
import {
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError, QuickAccessLimitError } from '../domain/errors';

import type { QuickAccessNodeRef } from './ports/i-quick-access.repository.port';
import { RECENTS_STORED } from './quick-access-config';
import type { QuickAccessConfig } from './quick-access-config';
import { QuickAccessService } from './quick-access.service';

const NOW = new Date('2026-10-03T10:00:00.000Z');
const MAX_PINNED = 3;
const RECENT_VISIBLE = 2;
const CONFIG: QuickAccessConfig = { maxPinned: MAX_PINNED, recentVisible: RECENT_VISIBLE };
const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const repository = new FakeQuickAccessRepository(journal);
  const clock = new FixedClock(NOW);
  const service = new QuickAccessService(transactions, repository, quotas, clock, CONFIG);

  const node = (type: 'file' | 'folder' = 'folder', owner: Actor = ANA): QuickAccessNodeRef => {
    const id = randomUUID();
    const name = `${type}-${id.slice(0, 4)}`;
    return repository.addNode(
      owner,
      type === 'file' ? { type, id, name, kind: 'pdf' } : { type, id, name },
    );
  };

  /** Fija `count` nodos nuevos, uno por segundo; devuelve sus referencias en el orden en que se fijaron. */
  const pinMany = async (count: number): Promise<QuickAccessNodeRef[]> => {
    const refs: QuickAccessNodeRef[] = [];
    for (let index = 0; index < count; index += 1) {
      const ref = node();
      clock.advance(1000);
      await service.pin(ANA, ref);
      refs.push(ref);
    }
    return refs;
  };

  /** Abre `count` nodos nuevos, uno por segundo. */
  const openMany = async (count: number): Promise<QuickAccessNodeRef[]> => {
    const refs: QuickAccessNodeRef[] = [];
    for (let index = 0; index < count; index += 1) {
      const ref = node('file');
      clock.advance(1000);
      await service.recordOpen(ANA, ref);
      refs.push(ref);
    }
    return refs;
  };

  const trash = (ref: QuickAccessNodeRef): void => {
    const found = repository.nodes.get(`${ref.type}:${ref.id}`);
    if (found !== undefined) found.trashed = true;
  };

  return { journal, transactions, repository, clock, service, node, pinMany, openMany, trash };
}

const idsOf = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe('QuickAccessService.list (CA-27, CA-28)', () => {
  it('CA-27: pide `maxPinned` fijados y `recentVisible + 1` recientes, en `withActor` y sin candado', async () => {
    const { service, repository, journal, transactions } = setup();

    await service.list(ANA);

    expect(repository.takes).toEqual([{ pinned: MAX_PINNED, recent: RECENT_VISIBLE + 1 }]);
    expect(transactions.actors).toEqual([ANA.id]);
    expect(journal.entries).not.toContain('quota:lockUsage');
  });

  it('CA-27: muestra `recentVisible` recientes del más nuevo al más viejo y `hasMoreRecent` si hay más', async () => {
    const { service, openMany } = setup();
    const opened = await openMany(RECENT_VISIBLE + 1);

    const list = await service.list(ANA);

    expect(idsOf(list.recent)).toEqual(idsOf(opened.slice(1).reverse()));
    expect(list.hasMoreRecent).toBe(true);
  });

  it('CA-27: sin más recientes que los visibles, `hasMoreRecent` es falso', async () => {
    const { service, openMany } = setup();
    await openMany(RECENT_VISIBLE);

    const list = await service.list(ANA);

    expect(list.recent).toHaveLength(RECENT_VISIBLE);
    expect(list.hasMoreRecent).toBe(false);
  });

  it('CA-27: un nodo fijado y abierto aparece solo en «Fijados»', async () => {
    const { service, pinMany } = setup();
    const [pinned] = await pinMany(1);
    if (pinned === undefined) throw new Error('sin fijado');

    await service.recordOpen(ANA, pinned);
    const list = await service.list(ANA);

    expect(idsOf(list.pinned)).toEqual([pinned.id]);
    expect(list.recent).toEqual([]);
  });

  it('R-10: con más fijados visibles que el tope, devuelve los `maxPinned` fijados más recientes', async () => {
    const { service, repository, pinMany, trash } = setup();
    const refs = await pinMany(MAX_PINNED);
    const [first] = refs;
    if (first === undefined) throw new Error('sin fijados');
    trash(first);
    const later = await pinMany(1);
    const restored = repository.nodes.get(`${first.type}:${first.id}`);
    if (restored !== undefined) restored.trashed = false;

    const list = await service.list(ANA);

    expect(idsOf(list.pinned)).toEqual(idsOf([...refs.slice(1), ...later].reverse()));
  });
});

describe('QuickAccessService.pin (CA-28)', () => {
  it('CA-28: toma `lockUsage` antes de buscar el nodo, lo fija y devuelve el elemento', async () => {
    const { service, journal, repository, node } = setup();
    const ref = node('file');

    const item = await service.pin(ANA, ref);

    expect(item).toMatchObject({ type: 'file', id: ref.id, kind: 'pdf' });
    expect(repository.rowOf(ANA, ref)?.pinnedAt).toEqual(NOW);
    expect(journal.indexOf('quota:lockUsage')).toBeLessThan(
      journal.indexOf('quickAccess:findAccessibleNode'),
    );
  });

  it('CA-28: con el tope lleno, `QuickAccessLimitError` con `maxPinned` y nada cambia', async () => {
    const { service, repository, node, pinMany } = setup();
    await pinMany(MAX_PINNED);
    const extra = node();

    await expect(service.pin(ANA, extra)).rejects.toEqual(new QuickAccessLimitError(MAX_PINNED));
    expect(repository.rowOf(ANA, extra)).toBeUndefined();
  });

  it('CA-28: `PUT` sobre un nodo ya fijado con el tope lleno responde sin contar ni cambiar `fijado_en`', async () => {
    const { service, repository, journal, clock, pinMany } = setup();
    const refs = await pinMany(MAX_PINNED);
    const [first] = refs;
    if (first === undefined) throw new Error('sin fijados');
    const pinnedAt = repository.rowOf(ANA, first)?.pinnedAt;
    journal.entries.length = 0;
    clock.advance(1000);

    const item = await service.pin(ANA, first);

    expect(item.id).toBe(first.id);
    expect(repository.rowOf(ANA, first)?.pinnedAt).toEqual(pinnedAt);
    expect(journal.entries).not.toContain('quickAccess:countPinned');
    expect(journal.entries).not.toContain('quickAccess:upsertPin');
  });

  it('CA-28: un fijado en la papelera no ocupa lugar en el tope', async () => {
    const { service, repository, node, pinMany, trash } = setup();
    const [first] = await pinMany(MAX_PINNED);
    if (first === undefined) throw new Error('sin fijados');
    trash(first);
    const extra = node();

    await service.pin(ANA, extra);

    expect(repository.rowOf(ANA, extra)?.pinnedAt).not.toBeNull();
  });

  it('CA-28: dos fijados concurrentes con un solo lugar libre: uno pasa y el otro es 422', async () => {
    const { service, node, pinMany } = setup();
    await pinMany(MAX_PINNED - 1);

    const results = await Promise.allSettled([service.pin(ANA, node()), service.pin(ANA, node())]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await service.list(ANA)).pinned).toHaveLength(MAX_PINNED);
  });

  it.each([
    ['ajeno', (ctx: ReturnType<typeof setup>) => ctx.node('file', BRUNO)],
    ['inexistente', () => ({ type: 'folder' as const, id: randomUUID() })],
    [
      'en la papelera',
      (ctx: ReturnType<typeof setup>) => {
        const ref = ctx.node();
        ctx.trash(ref);
        return ref;
      },
    ],
  ])('CA-22: un nodo %s es `NodeNotFoundError` y no deja fila', async (_label, refOf) => {
    const ctx = setup();
    const ref = refOf(ctx);

    await expect(ctx.service.pin(ANA, ref)).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(ctx.repository.rows).toEqual([]);
  });
});

describe('QuickAccessService.unpin (CA-28)', () => {
  it('CA-28: quitar un fijado nunca abierto borra la fila, sin candado', async () => {
    const { service, repository, journal, pinMany } = setup();
    const [ref] = await pinMany(1);
    if (ref === undefined) throw new Error('sin fijado');
    journal.entries.length = 0;

    await service.unpin(ANA, ref);

    expect(repository.rowOf(ANA, ref)).toBeUndefined();
    expect(journal.entries).not.toContain('quota:lockUsage');
  });

  it('CA-27: quitar un fijado que se abrió lo deja como reciente', async () => {
    const { service, pinMany } = setup();
    const [ref] = await pinMany(1);
    if (ref === undefined) throw new Error('sin fijado');
    await service.recordOpen(ANA, ref);

    await service.unpin(ANA, ref);
    const list = await service.list(ANA);

    expect(list.pinned).toEqual([]);
    expect(idsOf(list.recent)).toEqual([ref.id]);
  });

  it('CA-28: quitar un nodo que no estaba fijado no falla ni escribe (idempotente)', async () => {
    const { service, repository, journal, node } = setup();
    const ref = node();

    await service.unpin(ANA, ref);

    expect(repository.rows).toEqual([]);
    expect(journal.entries).not.toContain('quickAccess:removePin');
  });

  it('CA-22: quitar un nodo ajeno es `NodeNotFoundError`', async () => {
    const { service, node } = setup();

    await expect(service.unpin(ANA, node('folder', BRUNO))).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
  });
});

describe('QuickAccessService.recordOpen (CA-27)', () => {
  it('CA-27: registra la apertura y poda a `RECENTS_STORED`, sin candado', async () => {
    const { service, repository, journal, node } = setup();
    const ref = node('file');

    await service.recordOpen(ANA, ref);

    expect(repository.rowOf(ANA, ref)).toMatchObject({ pinnedAt: null, openedAt: NOW });
    expect(repository.prunedTo).toEqual([RECENTS_STORED]);
    expect(journal.indexOf('quickAccess:touchRecent')).toBeLessThan(
      journal.indexOf('quickAccess:pruneRecents'),
    );
    expect(journal.entries).not.toContain('quota:lockUsage');
  });

  it('CA-27: la poda conserva los `RECENTS_STORED` recientes más nuevos', async () => {
    const { repository, openMany } = setup();

    const opened = await openMany(RECENTS_STORED + 2);

    const kept = repository.rows.map((row) => row.ref.id);
    expect(kept.sort()).toEqual(idsOf(opened.slice(2)).sort());
  });

  it('CA-27: abrir un fijado solo actualiza `abierto_en`; sigue fijado', async () => {
    const { service, repository, clock, pinMany } = setup();
    const [ref] = await pinMany(1);
    if (ref === undefined) throw new Error('sin fijado');
    const pinnedAt = repository.rowOf(ANA, ref)?.pinnedAt;
    clock.advance(1000);

    await service.recordOpen(ANA, ref);

    expect(repository.rowOf(ANA, ref)).toMatchObject({ pinnedAt, openedAt: clock.now() });
  });

  it('CA-22: abrir un nodo en la papelera es `NodeNotFoundError`', async () => {
    const { service, node, trash } = setup();
    const ref = node();
    trash(ref);

    await expect(service.recordOpen(ANA, ref)).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});
