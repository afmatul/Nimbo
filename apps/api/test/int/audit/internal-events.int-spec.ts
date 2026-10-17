import { randomUUID } from 'node:crypto';

import { listAuditEventsResponseSchema } from '@nimbo/contracts';
import type { ListAuditEventsResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { AuditAction, AuditHttpModule, SYSTEM_ACTOR } from '../../../src/modules/audit';
import type { AuditRecord } from '../../../src/modules/audit';
import { AuditService } from '../../../src/modules/audit/application/audit.service';
import { TypeOrmAuditRepository } from '../../../src/modules/audit/infrastructure/persistence/typeorm-audit.repository';
import type { Actor } from '../../../src/shared';
import { createActor, FixedClock, Role, SystemClock } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

const MY_EVENTS = '/api/v1/audit/my-events';
/** Lo que `insertAccount` siembra en `usuario`: nunca debe salir en la respuesta (004 D-2). */
const SEEDED_NAME = 'Ana López';
const SEEDED_MAIL_DOMAIN = 'ejemplo.com';

interface Seeded {
  readonly onAna: AuditRecord[];
  readonly onBruno: AuditRecord;
  readonly catalog: AuditRecord;
}

const onAccount = (action: AuditAction, actor: Actor, targetUserId: string): AuditRecord => ({
  action,
  actor,
  targetUserId,
  resourceId: targetUserId,
});

const bodyOf = (response: Response): ListAuditEventsResponse => {
  expect(response.status).toBe(200);
  return listAuditEventsResponseSchema.parse(response.body);
};

/**
 * Acciones internas en «Mi actividad» (spec 011 CA-16; plan §3, §5): los eventos se escriben con `AuditService` real
 * como `nimbo_app` (internos con `withActor`, el sistema con `run`) y se leen por HTTP con la ruta de 004.
 */
describe('acciones internas en `GET /audit/my-events` (011 CA-16)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let database: AppDatabase;
  let audit: AuditService;
  const actors = new Map<Role | 'BRUNO', Actor>();
  const created: string[] = [];
  /** Eventos sin afectado: no se borran en cascada con las cuentas, los borra el dueño al final. */
  const unattachedResources: string[] = [];
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  const newActor = async (role: Role): Promise<Actor> => {
    const id = await owner.transaction((manager) => insertAccount(manager, role));
    created.push(id);
    return createActor(id, role);
  };

  const actor = (key: Role | 'BRUNO'): Actor => actors.get(key) as Actor;

  const writeAs = (who: Actor, record: AuditRecord): Promise<void> =>
    database.runner.withActor(who, () => audit.recordInTransaction(record));

  const seed = async (): Promise<Seeded> => {
    const ana = actor(Role.CLIENT);
    const seeded: Seeded = {
      onAna: [
        onAccount(AuditAction.CLIENT_FILES_VIEWED, actor(Role.SUPPORT), ana.id),
        onAccount(AuditAction.ACCOUNT_SUSPENDED, actor(Role.ADMIN), ana.id),
      ],
      onBruno: onAccount(AuditAction.CLIENT_FILES_VIEWED, actor(Role.SUPPORT), actor('BRUNO').id),
      catalog: {
        action: AuditAction.PLAN_CREATED,
        actor: actor(Role.ADMIN),
        targetUserId: null,
        resourceId: randomUUID(),
      },
    };
    unattachedResources.push(seeded.catalog.resourceId as string);
    for (const record of [...seeded.onAna, seeded.onBruno, seeded.catalog]) {
      await writeAs(record.actor as Actor, record);
    }
    return seeded;
  };

  const myEvents = (who: Actor): Promise<Response> => {
    const token = tokens.valid({ userId: who.id, role: who.role, sessionId: randomUUID() });
    return request(testApp.app.getHttpServer())
      .get(MY_EVENTS)
      .set('Authorization', `Bearer ${token}`);
  };

  let seeded: Seeded;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [AuditHttpModule] });
    owner = await connectAsOwner();
    database = await connectAsAppDatabase();
    const logger = { info: jest.fn(), error: jest.fn() };
    audit = new AuditService(
      new TypeOrmAuditRepository(database.context),
      database.runner,
      new SystemClock(),
      logger as never,
    );
    for (const role of [Role.CLIENT, Role.SUPPORT, Role.ADMIN])
      actors.set(role, await newActor(role));
    actors.set('BRUNO', await newActor(Role.CLIENT));
    seeded = await seed();
  });

  afterAll(async () => {
    await testApp?.close();
    await database?.dataSource.destroy();
    await owner?.query('DELETE FROM evento_auditoria WHERE recurso_id = ANY($1::uuid[])', [
      unattachedResources,
    ]);
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it('CA-16: el cliente ve fecha, rol y acción de cada acción interna sobre su cuenta', async () => {
    const { items } = bodyOf(await myEvents(actor(Role.CLIENT)));

    expect(items).toHaveLength(seeded.onAna.length);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'account.suspended',
          origin: 'staff',
          actorRole: Role.ADMIN,
          resourceType: null,
        }),
        expect.objectContaining({
          action: 'client.files_viewed',
          origin: 'staff',
          actorRole: Role.SUPPORT,
          resourceType: null,
        }),
      ]),
    );
    expect(items.every((item) => !Number.isNaN(Date.parse(item.occurredAt)))).toBe(true);
  });

  it('CA-16: la respuesta no trae nombre, correo ni id de la persona interna', async () => {
    const serialized = JSON.stringify((await myEvents(actor(Role.CLIENT))).body);

    for (const forbidden of [
      SEEDED_NAME,
      SEEDED_MAIL_DOMAIN,
      actor(Role.SUPPORT).id,
      actor(Role.ADMIN).id,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('CA-16: las acciones internas sobre otra cuenta no aparecen', async () => {
    const ana = bodyOf(await myEvents(actor(Role.CLIENT)));
    const bruno = bodyOf(await myEvents(actor('BRUNO')));

    expect(ana.items).toHaveLength(seeded.onAna.length);
    expect(bruno.items.map((item) => item.action)).toEqual([seeded.onBruno.action]);
  });

  it('CA-16: los cambios de catálogo no aparecen ni para el cliente ni para quien los hizo', async () => {
    const forClient = bodyOf(await myEvents(actor(Role.CLIENT)));
    const forAdmin = bodyOf(await myEvents(actor(Role.ADMIN)));

    expect(forClient.items.map((item) => item.action)).not.toContain(seeded.catalog.action);
    expect(forAdmin.items).toEqual([]);
  });

  it('CA-7: el evento del sistema se escribe dentro de `run` sin actor y nadie lo ve en «Mi actividad»', async () => {
    const newAdmin = await newActor(Role.ADMIN);
    unattachedResources.push(newAdmin.id);
    const bootstrap: AuditRecord = {
      action: AuditAction.ACCOUNT_BOOTSTRAP_ADMIN,
      actor: SYSTEM_ACTOR,
      targetUserId: null,
      resourceId: newAdmin.id,
    };

    await database.runner.run(() => audit.recordInTransaction(bootstrap));

    const rows = (await owner.query(
      'SELECT actor_id, rol_actor, usuario_afectado_id FROM evento_auditoria WHERE recurso_id = $1',
      [newAdmin.id],
    )) as unknown[];
    expect(rows).toEqual([{ actor_id: null, rol_actor: 'SYSTEM', usuario_afectado_id: null }]);
    expect(bodyOf(await myEvents(newAdmin)).items).toEqual([]);
  });
});
