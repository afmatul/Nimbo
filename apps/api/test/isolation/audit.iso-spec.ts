import { randomUUID } from 'node:crypto';

import { AUDIT_PAGE_SIZE, listAuditEventsResponseSchema } from '@nimbo/contracts';
import type { ListAuditEventsResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { AuditHttpModule } from '../../src/modules/audit';
import { encodeAuditCursor } from '../../src/modules/audit/infrastructure/persistence/audit-cursor';
import {
  buildDataSourceOptions,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
  TransactionContext,
} from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner, requiredEnv } from '../support/database-urls';

import { createIsolationWorld } from './setup/isolation-world';
import type {
  InternalRole,
  IsolationWorld,
  WorldAccount,
  WorldAuditEvent,
} from './setup/isolation-world';

const MY_EVENTS = '/api/v1/audit/my-events';
const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];
const MINUTE_MS = 60_000;
/** Los dos clientes tienen la misma cantidad de eventos, en los mismos instantes y con los mismos atributos. */
const TWIN_EVENTS = 3;
const FIRST_AT = new Date('2026-09-15T10:00:00.000Z');
const STAFF_MINUTE = 10;
const SUPPORT_NOTE = 'Revisamos tu cuota a petición tuya.';
const SEEDED_FILE_NAME = 'presupuesto-secreto-2026.docx';
const SEEDED_URL = 'https://minio.local/nimbo/objeto?X-Amz-Signature=firmada';
const SEEDED_TOKEN = 'token-de-enlace-secreto';
/** Las únicas claves que puede tener un evento en la respuesta (`auditEventResponseSchema`, CA-14). */
const RESPONSE_KEYS = [
  'action',
  'actorRole',
  'id',
  'itemCount',
  'note',
  'occurredAt',
  'origin',
  'resourceType',
  'sizeBytes',
];

const minutesAfter = (minutes: number): Date => new Date(FIRST_AT.getTime() + minutes * MINUTE_MS);

/** Ninguno de `forbidden` aparece en `listed` (falla mostrando los que se colaron). */
const expectNoneOf = (listed: readonly string[], forbidden: readonly string[]): void => {
  expect(listed.filter((id) => forbidden.includes(id))).toEqual([]);
};

const idsOf = (events: readonly { id: string }[]): string[] => events.map((event) => event.id);

/** Del más reciente al más antiguo, desempatando por `id` como `ORDER BY ocurrido_en DESC, id DESC`. */
const newestFirst = (events: readonly WorldAuditEvent[]): string[] =>
  idsOf(
    [...events].sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() || (right.id > left.id ? 1 : -1),
    ),
  );

/** El cuerpo de un 404 sin lo que la propia petición puso (la ruta pedida) ni el `correlationId`. */
const comparable404 = (response: Response, requestedId: string) => {
  const { correlationId: _ignored, ...body } = response.body as Record<string, unknown>;
  return {
    status: response.status,
    body: JSON.parse(JSON.stringify(body).replaceAll(requestedId, ':id')) as unknown,
  };
};

/**
 * Aislamiento de la bitácora de auditoría como `nimbo_app` (spec 004 T-06; CA-8, CA-12, CA-13, CA-14; RNF-05): cada
 * cuenta ve solo los eventos donde es la afectada, por la API y por SQL directo; ningún parámetro, cursor ni filtro lo
 * amplía; un rol interno no lee la actividad de otro; nadie escribe eventos a nombre ajeno y la respuesta no copia lo
 * que se haya colado en `atributos`.
 */
describe('aislamiento de la bitácora de auditoría (004 CA-8, CA-12, CA-13, CA-14)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;
  let owner: DataSource;
  let a: WorldAccount;
  let b: WorldAccount;
  let eventsA: WorldAuditEvent[];
  let eventsB: WorldAuditEvent[];
  /** Eventos de Soporte y del Administrador sobre la cuenta de A (lo que 011 hará). */
  let staffOnA: WorldAuditEvent[];
  const ownOfInternal = new Map<InternalRole, WorldAuditEvent>();

  const allEvents = (): WorldAuditEvent[] => [
    ...eventsA,
    ...eventsB,
    ...staffOnA,
    ...ownOfInternal.values(),
  ];

  const myEvents = (account: WorldAccount, query: string | object = {}): Promise<Response> =>
    request(testApp.app.getHttpServer())
      .get(MY_EVENTS)
      .query(query)
      .set('Authorization', `Bearer ${world.tokenFor(account)}`);

  const bodyOf = (response: Response): ListAuditEventsResponse => {
    expect(response.status).toBe(200);
    return listAuditEventsResponseSchema.parse(response.body);
  };

  const listedIds = async (account: WorldAccount, query: string | object = {}) =>
    idsOf(bodyOf(await myEvents(account, query)).items);

  const twinEventsOf = (account: WorldAccount): Promise<WorldAuditEvent[]> =>
    world.withAuditEvents(
      testApp,
      account,
      Array.from({ length: TWIN_EVENTS }, (_, minute) => ({ occurredAt: minutesAfter(minute) })),
    );

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await world.appAs({ modules: [AuditHttpModule] });
    owner = await connectAsOwner();
    [a, b] = world.clients;
    eventsA = await twinEventsOf(a);
    eventsB = await twinEventsOf(b);
    const support = world.internals[Role.SUPPORT];
    const admin = world.internals[Role.ADMIN];
    staffOnA = [
      ...(await world.withAuditEvents(testApp, support, [
        {
          target: a,
          action: 'trash.emptied',
          resourceType: null,
          occurredAt: minutesAfter(STAFF_MINUTE),
          attributes: {
            itemCount: 2,
            sizeBytes: 2048,
            note: SUPPORT_NOTE,
            fileName: SEEDED_FILE_NAME,
            folderName: SEEDED_FILE_NAME,
            email: a.email,
            actorEmail: support.email,
            otherEmail: b.email,
            url: SEEDED_URL,
            token: SEEDED_TOKEN,
            actorId: support.id,
          },
        },
      ])),
      ...(await world.withAuditEvents(testApp, admin, [
        { target: a, action: 'node.restored', occurredAt: minutesAfter(STAFF_MINUTE + 1) },
      ])),
    ];
    for (const role of INTERNAL_ROLES) {
      const [own] = await world.withAuditEvents(testApp, world.internals[role], [
        { occurredAt: minutesAfter(0) },
      ]);
      if (own === undefined) throw new Error(`no se sembró el evento propio de ${role}`);
      ownOfInternal.set(role, own);
    }
  });

  afterAll(async () => {
    await testApp?.close();
    await owner?.destroy();
    await world?.close();
  });

  describe('lista por la API (CA-8)', () => {
    it('ISO-1: B no puede ver en su actividad ningún evento de A, aunque sean gemelos de los suyos', async () => {
      const listed = await listedIds(b);

      expect(listed).toEqual(newestFirst(eventsB));
      expectNoneOf(listed, [...idsOf(eventsA), ...idsOf(staffOnA)]);
    });

    it('ISO-2: A no puede ver eventos de B y sí ve los suyos y los del personal sobre su cuenta', async () => {
      expect(await listedIds(a)).toEqual(newestFirst([...eventsA, ...staffOnA]));
    });

    it.each(['targetUserId', 'userId', 'usuario_afectado_id', 'afectado', 'actorId', 'accountId'])(
      'ISO-3: B no puede ver la actividad de A agregando `%s=<id de A>` a la consulta',
      async (parameter) => {
        const response = await myEvents(b, { [parameter]: a.id });

        expect(idsOf(bodyOf(response).items)).toEqual(newestFirst(eventsB));
      },
    );

    it.each([
      ['origen repetido', 'origin=self&origin=staff'],
      ['origen con SQL', `origin=${encodeURIComponent("staff' OR '1'='1")}`],
    ])('ISO-4: B no puede ampliar su lista con %s (400 `INVALID_ORIGIN`)', async (_case, query) => {
      const response = await myEvents(b, query);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'AUDIT_INVALID_QUERY',
        fields: [expect.objectContaining({ field: 'origin', reason: 'INVALID_ORIGIN' })],
      });
    });

    it.each([
      ['un campo de fecha con SQL', { from: "2026-09-15' OR '1'='1" }, 'from', 'INVALID_DATE'],
    ])('ISO-4: B no puede ampliar su lista con %s', async (_case, query, field, reason) => {
      const response = await myEvents(b, query);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        fields: [expect.objectContaining({ field, reason })],
      });
    });

    /** Express 5 usa el analizador `simple`: `origin[]` u `origin[x]` son claves desconocidas y el esquema las descarta. */
    it.each([
      ['origen como arreglo', 'origin[]=staff'],
      ['origen como objeto', 'origin[usuario_afectado_id]=<id>'],
      ['cursor como objeto', 'cursor[id]=x'],
      ['afectado como arreglo', 'usuario_afectado_id[]=<id>'],
    ])(
      'ISO-4: B no puede ampliar su lista con %s (se ignora: solo sus eventos)',
      async (_case, query) => {
        const listed = await listedIds(b, query.replaceAll('<id>', a.id));

        expect(listed).toEqual(newestFirst(eventsB));
      },
    );

    it('ISO-5: B no puede ver eventos de A combinando origen `staff` con el rango del evento interno sobre A', async () => {
      const window = {
        origin: 'staff',
        from: minutesAfter(STAFF_MINUTE).toISOString(),
        to: minutesAfter(STAFF_MINUTE + 2).toISOString(),
      };

      expect(bodyOf(await myEvents(b, window))).toEqual({ items: [], nextCursor: null });
      expect(await listedIds(a, window)).toEqual(newestFirst(staffOnA));
    });

    it('ISO-5: B no puede ver eventos de A combinando origen `self` con el rango de los eventos gemelos', async () => {
      const window = {
        origin: 'self',
        from: minutesAfter(0).toISOString(),
        to: minutesAfter(TWIN_EVENTS).toISOString(),
      };

      expect(await listedIds(b, window)).toEqual(newestFirst(eventsB));
    });
  });

  describe('cursor fabricado (CA-8, CA-9)', () => {
    const cursorAt = (occurredAt: Date, id: string): string =>
      encodeAuditCursor({ occurredAt, id });

    it('ISO-6: B no puede ver eventos de A con un cursor armado con un evento de A', async () => {
      const newestOfA = eventsA.at(-1) as WorldAuditEvent;

      const listed = await listedIds(b, { cursor: cursorAt(newestOfA.occurredAt, newestOfA.id) });

      expect(newestFirst(eventsB)).toEqual(expect.arrayContaining(listed));
      expectNoneOf(listed, idsOf(eventsA));
    });

    it('ISO-6: B no puede saber si existe un evento de A por su id en el cursor (mismo resultado que un id inexistente)', async () => {
      const [staffEvent] = staffOnA as [WorldAuditEvent];

      const foreign = await myEvents(b, {
        cursor: cursorAt(staffEvent.occurredAt, staffEvent.id),
      });
      const missing = await myEvents(b, { cursor: cursorAt(staffEvent.occurredAt, randomUUID()) });

      expect(bodyOf(foreign)).toEqual(bodyOf(missing));
      expect(idsOf(bodyOf(foreign).items)).toEqual(newestFirst(eventsB));
    });

    it('ISO-6: B no puede ver eventos de A con un cursor del futuro que lleva el id de un evento de A', async () => {
      const cursor = cursorAt(
        new Date('2099-01-01T00:00:00.000Z'),
        (eventsA[0] as WorldAuditEvent).id,
      );

      expect(await listedIds(b, { cursor })).toEqual(newestFirst(eventsB));
    });

    it.each([
      ['un id con SQL', ['2026-09-15T10:00:00.000Z', "x' OR '1'='1"]],
      ['dos ids en lugar de una posición', [randomUUID(), randomUUID()]],
      ['tres elementos', ['2026-09-15T10:00:00.000Z', randomUUID(), randomUUID()]],
    ])(
      'ISO-6: B no puede inyectar un cursor con %s (400 `INVALID_CURSOR`)',
      async (_case, tuple) => {
        const cursor = Buffer.from(JSON.stringify(tuple)).toString('base64url');

        const response = await myEvents(b, { cursor });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          fields: [expect.objectContaining({ field: 'cursor', reason: 'INVALID_CURSOR' })],
        });
      },
    );
  });

  describe('por id (CA-6, CA-8)', () => {
    it.each([
      ['GET', '/api/v1/audit/events/:id'],
      ['GET', '/api/v1/audit/my-events/:id'],
      ['PATCH', '/api/v1/audit/events/:id'],
      ['DELETE', '/api/v1/audit/events/:id'],
    ] as const)(
      'ISO-7: B no puede consultar ni modificar un evento de A con %s %s (mismo 404 que un id inexistente)',
      async (method, path) => {
        const send = (id: string): Promise<Response> => {
          const http = request(testApp.app.getHttpServer());
          const url = path.replace(':id', id);
          const call =
            method === 'GET'
              ? http.get(url)
              : method === 'PATCH'
                ? http.patch(url)
                : http.delete(url);
          return call.set('Authorization', `Bearer ${world.tokenFor(b)}`);
        };
        const target = (eventsA[0] as WorldAuditEvent).id;
        const missingId = randomUUID();

        const foreign = await send(target);
        const missing = await send(missingId);

        expect(foreign.status).toBe(404);
        expect(comparable404(foreign, target)).toEqual(comparable404(missing, missingId));
        expect(JSON.stringify(foreign.body)).not.toContain('node.trashed');
      },
    );
  });

  describe('roles internos (CA-12)', () => {
    it.each(INTERNAL_ROLES)(
      'ISO-8: %s no puede leer la actividad de un cliente; solo ve la suya',
      async (role) => {
        const internal = world.internals[role];
        const own = ownOfInternal.get(role) as WorldAuditEvent;

        expect(await listedIds(internal)).toEqual([own.id]);
        expect(await listedIds(internal, { targetUserId: a.id, userId: a.id })).toEqual([own.id]);
        expect(await listedIds(internal, { origin: 'staff' })).toEqual([]);
      },
    );

    it.each([Role.SUPPORT, Role.ADMIN] as const)(
      'ISO-8: %s no puede leer el evento que él mismo registró sobre la cuenta de A',
      async (role) => {
        const authored = staffOnA.filter((event) => event.actorRole === role);
        const listed = await listedIds(world.internals[role]);

        expect(authored).toHaveLength(1);
        expectNoneOf(listed, idsOf(authored));
      },
    );
  });

  describe('evento interno siempre visible para el afectado (CA-13)', () => {
    it.each([
      ['sin filtros', {}],
      ['con origen `staff`', { origin: 'staff' }],
      [
        'con parámetros que intentan ocultarlo',
        { hideStaff: 'true', actorRole: 'CLIENT', visible: 'false' },
      ],
      [
        'con el rango que lo contiene',
        { from: minutesAfter(0).toISOString(), to: minutesAfter(60).toISOString() },
      ],
    ])(
      'ISO-9: el personal no puede ocultarle a A sus acciones sobre su cuenta (%s)',
      async (_case, query) => {
        expect(await listedIds(a, query)).toEqual(expect.arrayContaining(idsOf(staffOnA)));
      },
    );

    it('ISO-9: A ve los eventos internos con su rol y origen `staff`, y `self` no los mezcla', async () => {
      const staff = bodyOf(await myEvents(a, { origin: 'staff' })).items;

      expect(staff.map(({ actorRole, origin }) => ({ actorRole, origin }))).toEqual([
        { actorRole: Role.ADMIN, origin: 'staff' },
        { actorRole: Role.SUPPORT, origin: 'staff' },
      ]);
      expect(await listedIds(a, { origin: 'self' })).toEqual(newestFirst(eventsA));
    });

    it('ISO-9: un evento interno sobre A no cuenta para el tamaño de página de otra cuenta', async () => {
      const page = bodyOf(await myEvents(b));

      expect(page.items.length).toBeLessThan(AUDIT_PAGE_SIZE);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('lista blanca de la respuesta (CA-14)', () => {
    it('ISO-10: A no puede recibir nombres, correos, URLs, tokens ni el id del actor aunque estén en `atributos`', async () => {
      const response = await myEvents(a);
      const serialized = JSON.stringify(response.body);
      const support = world.internals[Role.SUPPORT];
      const admin = world.internals[Role.ADMIN];
      const forbidden = [
        SEEDED_FILE_NAME,
        SEEDED_URL,
        'minio.local',
        SEEDED_TOKEN,
        a.email,
        b.email,
        support.email,
        admin.email,
        support.id,
        admin.id,
        a.id,
        a.name,
        ...staffOnA.flatMap((event) => [event.correlationId ?? '', event.resourceId ?? '']),
        ...eventsA.flatMap((event) => [event.correlationId ?? '', event.resourceId ?? '']),
      ].filter((value) => value !== '');

      for (const value of forbidden)
        expect({ value, leaked: serialized.includes(value) }).toEqual({ value, leaked: false });
      for (const item of bodyOf(response).items) {
        expect(RESPONSE_KEYS).toEqual(expect.arrayContaining(Object.keys(item)));
      }
    });

    it('ISO-10: del evento sembrado con datos prohibidos solo salen conteo, tamaño y motivo', async () => {
      const [seeded] = staffOnA as [WorldAuditEvent];

      const item = bodyOf(await myEvents(a)).items.find((event) => event.id === seeded.id);

      expect(item).toEqual({
        id: seeded.id,
        occurredAt: seeded.occurredAt.toISOString(),
        action: 'trash.emptied',
        origin: 'staff',
        actorRole: Role.SUPPORT,
        resourceType: null,
        itemCount: 2,
        sizeBytes: 2048,
        note: SUPPORT_NOTE,
      });
    });
  });

  describe('RLS como segunda barrera (CA-8, CA-12; ADR-0005)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const actorOf = (account: WorldAccount): Actor => createActor(account.id, account.role);

    const inScope = (
      account: WorldAccount,
      sql: string,
      parameters: unknown[],
    ): Promise<unknown> => {
      const actor = actorOf(account);
      return runner.withActor(actor, () =>
        (context.requireActorScope(actor) as EntityManager).query(sql, parameters),
      );
    };

    const visibleIds = async (account: WorldAccount, sql: string, parameters: unknown[]) =>
      idsOf((await inScope(account, sql, parameters)) as { id: string }[]).sort();

    const insertSql = `INSERT INTO evento_auditoria (id, accion, actor_id, rol_actor, usuario_afectado_id, ocurrido_en)
                       VALUES ($1, 'node.trashed', $2, $3, $4, now())`;

    const ownerCount = async (id: string): Promise<number> => {
      const [row] = (await owner.query(
        'SELECT count(*)::int AS total FROM evento_auditoria WHERE id = $1',
        [id],
      )) as { total: number }[];
      return row?.total ?? -1;
    };

    beforeAll(() => {
      runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      context = testApp.app.get(TransactionContext);
    });

    it('ISO-11: con el actor de A, B no aparece aunque la consulta pida sus eventos por afectado', async () => {
      expect(
        await visibleIds(a, 'SELECT id FROM evento_auditoria WHERE usuario_afectado_id = $1', [
          b.id,
        ]),
      ).toEqual([]);
    });

    it('ISO-11: con el actor de A, una consulta sin filtro por afectado solo devuelve los eventos de A', async () => {
      const listed = await visibleIds(a, 'SELECT id FROM evento_auditoria WHERE id = ANY($1)', [
        idsOf(allEvents()),
      ]);

      expect(listed).toEqual(idsOf([...eventsA, ...staffOnA]).sort());
    });

    it.each(INTERNAL_ROLES)(
      'ISO-11: como %s, una consulta sin filtro solo devuelve su propio evento',
      async (role) => {
        const internal = world.internals[role];

        expect(
          await visibleIds(internal, 'SELECT id FROM evento_auditoria WHERE id = ANY($1)', [
            idsOf(allEvents()),
          ]),
        ).toEqual([(ownOfInternal.get(role) as WorldAuditEvent).id]);
        expect(
          await visibleIds(
            internal,
            'SELECT id FROM evento_auditoria WHERE usuario_afectado_id = $1',
            [a.id],
          ),
        ).toEqual([]);
      },
    );

    it('ISO-11: `nimbo_app` sin actor no ve ninguna fila de `evento_auditoria`', async () => {
      const bare = await new DataSource(
        buildDataSourceOptions({ DATABASE_URL: requiredEnv('DATABASE_URL') }),
      ).initialize();
      try {
        const [row] = (await bare.query(
          'SELECT count(*)::int AS total FROM evento_auditoria WHERE id = ANY($1)',
          [idsOf(allEvents())],
        )) as { total: number }[];

        expect(row?.total).toBe(0);
      } finally {
        await bare.destroy();
      }
    });

    /** Quién inserta, a nombre de quién, con qué rol y sobre qué cuenta. */
    type InsertAttempt = readonly [WorldAccount, string | null, Role, string];
    const support = (): WorldAccount => world.internals[Role.SUPPORT];
    const attempts: readonly (readonly [string, () => InsertAttempt])[] = [
      ['A sobre la cuenta de B', () => [a, a.id, Role.CLIENT, b.id]],
      ['A a nombre de B sobre la cuenta de A', () => [a, b.id, Role.CLIENT, a.id]],
      ['A a nombre de B sobre la cuenta de B', () => [a, b.id, Role.CLIENT, b.id]],
      ['A declarándose Soporte sobre la cuenta de B', () => [a, a.id, Role.SUPPORT, b.id]],
      [
        'Soporte a nombre del Administrador',
        () => [support(), world.internals[Role.ADMIN].id, Role.ADMIN, a.id],
      ],
      ['Soporte declarándose Administrador', () => [support(), support().id, Role.ADMIN, a.id]],
      ['A con actor anonimizado (`NULL`) sobre la cuenta de B', () => [a, null, Role.CLIENT, b.id]],
    ];

    it.each(attempts)(
      'ISO-12: un actor no puede insertar un evento %s (RLS)',
      async (_case, build) => {
        const [account, actorId, role, targetId] = build();
        const id = randomUUID();

        await expect(inScope(account, insertSql, [id, actorId, role, targetId])).rejects.toThrow(
          /new row violates row-level security policy for table "evento_auditoria"/,
        );
        expect(await ownerCount(id)).toBe(0);
      },
    );

    it('ISO-12: A no puede sembrar un evento sobre B con el repositorio de la app', async () => {
      await expect(world.withAuditEvents(testApp, a, [{ target: b }])).rejects.toThrow(
        /row-level security/,
      );
      expect(await listedIds(b)).toEqual(newestFirst(eventsB));
    });

    it.each([
      [
        'reasignar su evento a B',
        'UPDATE evento_auditoria SET usuario_afectado_id = $1 WHERE id = $2',
        () => [b.id, eventsA[0]?.id],
      ],
      [
        'borrar los eventos de B',
        'DELETE FROM evento_auditoria WHERE usuario_afectado_id = $1',
        () => [b.id],
      ],
      [
        'borrar el evento interno sobre su cuenta',
        'DELETE FROM evento_auditoria WHERE id = $1',
        () => [staffOnA[0]?.id],
      ],
    ])('ISO-13: A no puede %s (`permission denied`)', async (_case, sql, parameters) => {
      await expect(inScope(a, sql, parameters())).rejects.toThrow(
        /permission denied for table evento_auditoria/,
      );
      expect(await listedIds(b)).toEqual(newestFirst(eventsB));
      expect(await listedIds(a)).toEqual(newestFirst([...eventsA, ...staffOnA]));
    });
  });
});
