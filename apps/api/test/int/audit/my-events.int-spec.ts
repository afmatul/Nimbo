import { randomUUID } from 'node:crypto';

import {
  AUDIT_PAGE_SIZE,
  listAuditEventsResponseSchema,
  SHARED_ERROR_CODES,
} from '@nimbo/contracts';
import type { ListAuditEventsResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { AuditHttpModule } from '../../../src/modules/audit';
import type { AuditEntry } from '../../../src/modules/audit/domain/audit-entry';
import { createAuditEntry } from '../../../src/modules/audit/domain/audit-entry';
import { TypeOrmAuditRepository } from '../../../src/modules/audit/infrastructure/persistence/typeorm-audit.repository';
import type { Actor } from '../../../src/shared';
import { createActor, FixedClock, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

const MY_EVENTS = '/api/v1/audit/my-events';
const MINUTE_MS = 60_000;
const SELF_EVENTS = 25;
const FIRST_SELF_AT = new Date('2026-09-01T08:00:00.000Z');
const STAFF_AT = new Date('2026-09-10T08:00:00.000Z');
const SUPPORT_NOTE = 'Revisamos tu cuota a petición tuya.';
const SEEDED_FILE_NAME = 'presupuesto-secreto.docx';
const INTERNAL_ROLES = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const;

const minutesAfter = (start: Date, minutes: number): Date =>
  new Date(start.getTime() + minutes * MINUTE_MS);

const eventOf = (actor: Actor, targetUserId: string, occurredAt: Date): AuditEntry =>
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

/** Evento interno sobre la cuenta de un cliente, con motivo y un nombre de archivo sembrado que no debe salir (CA-14). */
const staffEventOf = (support: Actor, targetUserId: string): AuditEntry =>
  createAuditEntry({
    ...eventOf(support, targetUserId, STAFF_AT),
    action: 'trash.emptied',
    resourceType: null,
    resourceId: null,
    attributes: { itemCount: 2, sizeBytes: 2048, note: SUPPORT_NOTE, fileName: SEEDED_FILE_NAME },
  });

const bodyOf = (response: Response): ListAuditEventsResponse => {
  expect(response.status).toBe(200);
  return listAuditEventsResponseSchema.parse(response.body);
};

const idsOf = (body: ListAuditEventsResponse): string[] => body.items.map((item) => item.id);

/**
 * `GET /audit/my-events` por HTTP como `nimbo_app` (spec 004 CA-7, CA-9 a CA-14; plan §4): `AuditHttpModule` real, los
 * eventos sembrados con el repositorio dentro de `withActor` y los tokens de la estrategia de prueba.
 */
describe('GET /audit/my-events (CA-7, CA-9 a CA-14)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let database: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  let support: Actor;
  const internals = new Map<Role, { actor: Actor; eventId: string }>();
  const created: string[] = [];
  const selfEvents: AuditEntry[] = [];
  let staffEvent: AuditEntry;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  const seed = (actor: Actor, entries: readonly AuditEntry[]): Promise<void> => {
    const repository = new TypeOrmAuditRepository(database.context);
    return database.runner.withActor(actor, async () => {
      for (const entry of entries) await repository.insert(actor, entry);
    });
  };

  const newActor = async (role: Role): Promise<Actor> => {
    const id = await owner.transaction((manager) => insertAccount(manager, role));
    created.push(id);
    return createActor(id, role);
  };

  const myEvents = (actor: Actor | null, query: Record<string, string> = {}): Promise<Response> => {
    const call = request(testApp.app.getHttpServer()).get(MY_EVENTS).query(query);
    if (actor === null) return call;
    const token = tokens.valid({ userId: actor.id, role: actor.role, sessionId: randomUUID() });
    return call.set('Authorization', `Bearer ${token}`);
  };

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [AuditHttpModule] });
    owner = await connectAsOwner();
    database = await connectAsAppDatabase();
    ana = await newActor(Role.CLIENT);
    bruno = await newActor(Role.CLIENT);
    selfEvents.push(
      ...Array.from({ length: SELF_EVENTS }, (_, index) =>
        eventOf(ana, ana.id, minutesAfter(FIRST_SELF_AT, index)),
      ),
    );
    await seed(ana, selfEvents);
    for (const role of INTERNAL_ROLES) {
      const actor = await newActor(role);
      const own = eventOf(actor, actor.id, FIRST_SELF_AT);
      await seed(actor, [own]);
      internals.set(role, { actor, eventId: own.id });
    }
    support = internals.get(Role.SUPPORT)?.actor as Actor;
    staffEvent = staffEventOf(support, ana.id);
    await seed(support, [staffEvent]);
  });

  afterAll(async () => {
    await testApp?.close();
    await database?.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it('CA-7, CA-9, CA-13: del más reciente al más antiguo, 20 por página con cursor; el evento interno va primero', async () => {
    const first = bodyOf(await myEvents(ana));
    const second = bodyOf(await myEvents(ana, { cursor: first.nextCursor ?? '' }));
    const expected = [staffEvent, ...[...selfEvents].reverse()].map((entry) => entry.id);

    expect(first.items).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).toBeNull();
    expect([...idsOf(first), ...idsOf(second)]).toEqual(expected);
  });

  it('CA-7, CA-13, CA-14: el evento interno muestra rol, origen, conteo, tamaño y motivo; nada más', async () => {
    const response = await myEvents(ana, { origin: 'staff' });

    expect(bodyOf(response).items).toEqual([
      {
        id: staffEvent.id,
        occurredAt: STAFF_AT.toISOString(),
        action: 'trash.emptied',
        origin: 'staff',
        actorRole: Role.SUPPORT,
        resourceType: null,
        itemCount: 2,
        sizeBytes: 2048,
        note: SUPPORT_NOTE,
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain(SEEDED_FILE_NAME);
    expect(JSON.stringify(response.body)).not.toContain(support.id);
  });

  it('CA-7: un evento propio sale con origen `self` y sin `note`', async () => {
    const newest = selfEvents.at(-1) as AuditEntry;

    const [item] = bodyOf(await myEvents(ana, { origin: 'self' })).items;

    expect(item).toEqual({
      id: newest.id,
      occurredAt: newest.occurredAt.toISOString(),
      action: 'node.trashed',
      origin: 'self',
      actorRole: Role.CLIENT,
      resourceType: 'folder',
      itemCount: 3,
      sizeBytes: null,
    });
  });

  it('CA-10: `from` inclusivo y `to` exclusivo filtran por instante', async () => {
    const query = {
      from: minutesAfter(FIRST_SELF_AT, 2).toISOString(),
      to: minutesAfter(FIRST_SELF_AT, 5).toISOString(),
    };

    const body = bodyOf(await myEvents(ana, query));

    expect(idsOf(body)).toEqual([selfEvents[4], selfEvents[3], selfEvents[2]].map((e) => e?.id));
    expect(body.nextCursor).toBeNull();
  });

  it('CA-10: el origen `self` excluye el evento interno', async () => {
    const first = bodyOf(await myEvents(ana, { origin: 'self' }));
    const second = bodyOf(await myEvents(ana, { origin: 'self', cursor: first.nextCursor ?? '' }));

    expect([...idsOf(first), ...idsOf(second)]).not.toContain(staffEvent.id);
    expect(first.items.length + second.items.length).toBe(SELF_EVENTS);
  });

  it('CA-11: un cliente sin eventos recibe una lista vacía', async () => {
    expect(bodyOf(await myEvents(bruno))).toEqual({ items: [], nextCursor: null });
  });

  it('CA-11: un filtro sin resultados también es una lista vacía', async () => {
    const body = bodyOf(await myEvents(ana, { to: '2020-01-01T00:00:00.000Z' }));

    expect(body).toEqual({ items: [], nextCursor: null });
  });

  it.each(INTERNAL_ROLES)('CA-12: %s solo recibe los eventos de su propia cuenta', async (role) => {
    const internal = internals.get(role);
    if (internal === undefined) throw new Error(`falta el actor ${role}`);

    expect(idsOf(bodyOf(await myEvents(internal.actor)))).toEqual([internal.eventId]);
  });

  it('CA-12: sin sesión responde `401 SHARED_UNAUTHENTICATED`', async () => {
    const response = await myEvents(null);

    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe(SHARED_ERROR_CODES.UNAUTHENTICATED);
  });

  it.each([
    [{ from: 'ayer' }, 'from', 'INVALID_DATE'],
    [{ to: '2026-13-01' }, 'to', 'INVALID_DATE'],
    [{ from: '2026-09-02T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }, 'to', 'INVALID_RANGE'],
    [{ origin: 'admin' }, 'origin', 'INVALID_ORIGIN'],
    [{ cursor: 'basura' }, 'cursor', 'INVALID_CURSOR'],
  ])('CA-10: %j responde `400 AUDIT_INVALID_QUERY` con `%s` `%s`', async (query, field, reason) => {
    const response = await myEvents(ana, query);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'AUDIT_INVALID_QUERY',
      fields: [expect.objectContaining({ field, reason })],
    });
  });
});
