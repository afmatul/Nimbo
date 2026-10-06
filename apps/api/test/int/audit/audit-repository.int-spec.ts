import { randomUUID } from 'node:crypto';

import { AUDIT_PAGE_SIZE } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import type { AuditPage } from '../../../src/modules/audit/application/ports/i-audit.repository.port';
import type { AuditEntry } from '../../../src/modules/audit/domain/audit-entry';
import { createAuditEntry } from '../../../src/modules/audit/domain/audit-entry';
import type { AuditQuery } from '../../../src/modules/audit/domain/audit-query';
import { createAuditQuery } from '../../../src/modules/audit/domain/audit-query';
import { TypeOrmAuditRepository } from '../../../src/modules/audit/infrastructure/persistence/typeorm-audit.repository';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

/**
 * `TypeOrmAuditRepository` como `nimbo_app` dentro de `withActor` (spec 004 CA-1, CA-9, CA-10; plan §2 y §3): inserta
 * sin `RETURNING`, pagina con el teclado `(ocurrido_en, id)` y filtra por fecha y origen dentro del SQL.
 */
const SAME_INSTANT = new Date('2026-10-01T12:00:00.123Z');
const EVENTS_AT_SAME_INSTANT = 45;

let owner: DataSource;
let app: AppDatabase;
let repository: TypeOrmAuditRepository;
let ana: Actor;
let support: Actor;
const created: string[] = [];

const entryOf = (actor: Actor, targetUserId: string, occurredAt: Date): AuditEntry =>
  createAuditEntry({
    id: randomUUID(),
    action: 'node.trashed',
    actorId: actor.id,
    actorRole: actor.role,
    targetUserId,
    resourceType: 'folder',
    resourceId: randomUUID(),
    attributes: { nodeType: 'folder', itemCount: 3 },
    occurredAt,
    correlationId: `corr-${randomUUID()}`,
  });

const insertAll = (actor: Actor, entries: readonly AuditEntry[]): Promise<void> =>
  app.runner.withActor(actor, async () => {
    for (const entry of entries) await repository.insert(actor, entry);
  });

const list = (actor: Actor, query: AuditQuery): Promise<AuditPage> =>
  app.runner.withActor(actor, () => repository.listForTarget(actor, createAuditQuery(query)));

/** Recorre todas las páginas siguiendo `nextCursor`; devuelve cuántas filas trajo cada una y las entradas en orden. */
const listAllPages = async (
  actor: Actor,
  query: AuditQuery = {},
): Promise<{ sizes: number[]; entries: AuditEntry[] }> => {
  const sizes: number[] = [];
  const entries: AuditEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await list(actor, cursor === undefined ? query : { ...query, cursor });
    sizes.push(page.entries.length);
    entries.push(...page.entries);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return { sizes, entries };
};

const idsOf = (entries: readonly AuditEntry[]): string[] => entries.map((entry) => entry.id);

beforeAll(async () => {
  owner = await connectAsOwner();
  app = await connectAsAppDatabase();
  repository = new TypeOrmAuditRepository(app.context);
  const accounts = await owner.transaction(async (manager) => ({
    ana: await insertAccount(manager),
    support: await insertAccount(manager, Role.SUPPORT),
  }));
  created.push(accounts.ana, accounts.support);
  ana = createActor(accounts.ana, Role.CLIENT);
  support = createActor(accounts.support, Role.SUPPORT);
});

afterAll(async () => {
  await app.dataSource.destroy();
  await removeAccounts(owner, created);
  await owner.destroy();
});

describe('TypeOrmAuditRepository.insert (CA-1)', () => {
  it('CA-1: guarda acción, actor, rol, afectado, recurso, atributos, fecha y correlationId', async () => {
    const entry = entryOf(ana, ana.id, new Date('2026-09-01T08:00:00.000Z'));
    await insertAll(ana, [entry]);

    const page = await list(ana, { to: new Date('2026-09-02T00:00:00.000Z') });

    expect(page.entries).toEqual([entry]);
  });

  it('CA-1: un rol interno inserta un evento sobre la cuenta de un cliente sin poder leerlo (sin `RETURNING`)', async () => {
    const entry = entryOf(support, ana.id, new Date('2026-09-03T08:00:00.000Z'));
    await insertAll(support, [entry]);

    const own = await list(support, {});
    const client = await list(ana, { origin: 'staff' });

    expect(own.entries).toEqual([]);
    expect(client.entries.map((item) => item.id)).toContain(entry.id);
  });

  it('CA-1: un cliente no puede insertar un evento sobre otra cuenta (RLS)', async () => {
    await expect(insertAll(ana, [entryOf(ana, support.id, new Date())])).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe('TypeOrmAuditRepository.listForTarget (CA-9, CA-10)', () => {
  let sameInstantIds: string[] = [];

  beforeAll(async () => {
    const entries = Array.from({ length: EVENTS_AT_SAME_INSTANT }, () =>
      entryOf(ana, ana.id, SAME_INSTANT),
    );
    sameInstantIds = entries.map((entry) => entry.id);
    await insertAll(ana, entries);
  });

  const sameInstantRange = {
    from: SAME_INSTANT,
    to: new Date(SAME_INSTANT.getTime() + 1),
  };

  it('CA-9: 45 eventos del mismo milisegundo se paginan de 20 en 20 sin duplicados ni omisiones', async () => {
    const { sizes, entries } = await listAllPages(ana, sameInstantRange);
    const ids = idsOf(entries);

    expect(sizes).toEqual([AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZE, 5]);
    expect(new Set(ids).size).toBe(EVENTS_AT_SAME_INSTANT);
    expect([...ids].sort()).toEqual([...sameInstantIds].sort());
  });

  it('CA-9: del más reciente al más antiguo y, en el mismo instante, por id descendente', async () => {
    const { entries } = await listAllPages(ana);
    const instants = entries.map((entry) => entry.occurredAt.getTime());
    const tied = idsOf(
      entries.filter((entry) => entry.occurredAt.getTime() === SAME_INSTANT.getTime()),
    );

    expect(instants).toEqual([...instants].sort((a, b) => b - a));
    expect(tied).toEqual([...tied].sort().reverse());
  });

  it('CA-10: `from` es inclusivo y `to` exclusivo', async () => {
    const before = await listAllPages(ana, { to: SAME_INSTANT });
    const fromOn = await listAllPages(ana, { from: SAME_INSTANT });

    expect(idsOf(before.entries).filter((id) => sameInstantIds.includes(id))).toEqual([]);
    expect(before.entries.length).toBeGreaterThan(0);
    expect(idsOf(fromOn.entries).sort()).toEqual([...sameInstantIds].sort());
  });

  it('CA-10: el origen `staff` trae solo lo del personal y `self` solo lo propio', async () => {
    const staff = await listAllPages(ana, { origin: 'staff' });
    const self = await listAllPages(ana, { origin: 'self' });

    expect(staff.entries.length).toBeGreaterThan(0);
    expect(staff.entries.every((entry) => entry.actorId !== ana.id)).toBe(true);
    expect(self.entries.length).toBeGreaterThan(EVENTS_AT_SAME_INSTANT);
    expect(self.entries.every((entry) => entry.actorId === ana.id)).toBe(true);
  });

  it('CA-11: sin eventos en el rango, una página vacía sin cursor', async () => {
    const page = await list(ana, { to: new Date('2020-01-01T00:00:00.000Z') });

    expect(page).toEqual({ entries: [], nextCursor: null });
  });
});
