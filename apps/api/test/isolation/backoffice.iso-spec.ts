import { randomUUID } from 'node:crypto';

import { listAuditEventsResponseSchema } from '@nimbo/contracts';
import type { AuditEventResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import type { DataSource } from 'typeorm';

import { AuditAction } from '../../src/modules/audit';
import { NotificationsWorkerModule } from '../../src/modules/notifications';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { setupTokenSentTo } from '../int/identity/identity-test-app';
import { buildTestEnv } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { insertAccount, removeAccounts } from '../int/storage/storage-test-db';
import { connectAsOwner } from '../support/database-urls';
import { uniqueEmployeeCode } from '../support/employee-codes';
import { createFullApiTestApp } from '../support/full-api-test-app';

import { INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type {
  InternalRole,
  IsolationWorld,
  WorldAccount,
  WorldFile,
} from './setup/isolation-world';

const CLIENT_FILES = '/api/v1/backoffice/client-files';
const ACCOUNTS = '/api/v1/backoffice/accounts';
const METRICS = '/api/v1/backoffice/metrics';
const PLANS = '/api/v1/backoffice/plans';
const MY_EVENTS = '/api/v1/audit/my-events';
/** Nombre de los planes que crea la suite: se borran al final (la base es compartida con otras suites). */
const PLAN_NAME_PREFIX = 'Plan del aislamiento ';
/** A y B tienen archivos con los mismos nombres: nada los distingue salvo el dueño. */
const TWIN_NAMES = ['Contrato.txt', 'Contrato (1).txt'];
/** Marcas de una URL (firmada o no) que ninguna respuesta del backoffice puede traer. */
const URL_MARKERS = ['http', 'X-Amz-'];
/** Una carga en curso por cliente: ningún rol interno lee `carga`. */
const UPLOADS_PER_CLIENT = 1;
const FILES_SQL = 'SELECT id FROM archivo WHERE id = ANY($1) ORDER BY id';
const UPLOADS_SQL = 'SELECT id FROM carga WHERE propietario_id = ANY($1) ORDER BY id';
/** Eventos en los que una cuenta del mundo es la afectada o quien actúa. */
const WORLD_EVENTS_SQL = `SELECT id, usuario_afectado_id AS "targetUserId", actor_id AS "actorId"
  FROM evento_auditoria WHERE usuario_afectado_id = ANY($1) OR actor_id = ANY($1)`;

type Http = ReturnType<typeof request>;

interface WorldEventRow {
  readonly id: string;
  readonly targetUserId: string;
  readonly actorId: string;
}

/** Una acción del backoffice: quién la usa, qué claves puede traer su respuesta y la petición sobre la cuenta de A. */
interface BackofficeRoute {
  readonly route: string;
  readonly allowed: readonly InternalRole[];
  /** Lista blanca de claves, en cualquier nivel del cuerpo: sin contenido, texto, URL, clave de objeto ni versiones. */
  readonly keys: readonly string[];
  /** La petición sin el token, que pone la tabla. */
  readonly request: (http: Http, target: WorldAccount) => Test;
  /** Estado en que la fila necesita a A antes de la petición (como el dueño); tras cada prueba, A vuelve a `activa`. */
  readonly targetStatus?: 'suspendida';
  /** Precondición de la fila: deja listo lo que la petición necesita (además del estado de A). */
  readonly prepare?: () => Promise<void>;
  /** Respuesta de éxito si no es `200` (el alta responde `201`). */
  readonly successStatus?: number;
}

const CLIENT_FILES_ROUTE: BackofficeRoute = {
  route: `GET ${CLIENT_FILES}`,
  allowed: [Role.ADMIN, Role.SUPPORT],
  keys: [
    ...['client', 'items', 'page', 'pageSize', 'total', 'id', 'fullName', 'email'],
    ...['name', 'kind', 'sizeBytes', 'createdAt', 'updatedAt', 'trashedAt'],
  ],
  request: (http, target) => http.get(CLIENT_FILES).query({ email: target.email }),
};

/** Una cuenta en la lista y en la ficha (CA-1): sin ningún dato de archivos. */
const ACCOUNT_KEYS = [
  ...['id', 'email', 'fullName', 'role', 'status', 'emailVerified'],
  ...['planName', 'usedBytes', 'createdAt', 'isSelf'],
];

/** Correos de las altas que intenta la tabla: las que sí se crean se borran al final (y su correo se consume). */
const enrolledEmails: string[] = [];

/** Cuentas (CA-1 a CA-6), solo el Administrador; cada fila arma su precondición y no depende del orden. */
const ACCOUNT_ROUTES: readonly BackofficeRoute[] = [
  {
    route: `GET ${ACCOUNTS}`,
    allowed: [Role.ADMIN],
    keys: ['items', 'page', 'pageSize', 'total', ...ACCOUNT_KEYS],
    request: (http, target) => http.get(ACCOUNTS).query({ email: target.email }),
  },
  {
    route: `GET ${ACCOUNTS}/:id`,
    allowed: [Role.ADMIN],
    keys: ACCOUNT_KEYS,
    request: (http, target) => http.get(`${ACCOUNTS}/${target.id}`),
  },
  {
    route: `POST ${ACCOUNTS}/:id/suspension`,
    allowed: [Role.ADMIN],
    keys: ACCOUNT_KEYS,
    request: (http, target) => http.post(`${ACCOUNTS}/${target.id}/suspension`),
  },
  {
    route: `DELETE ${ACCOUNTS}/:id/suspension`,
    allowed: [Role.ADMIN],
    keys: ACCOUNT_KEYS,
    request: (http, target) => http.delete(`${ACCOUNTS}/${target.id}/suspension`),
    targetStatus: 'suspendida',
  },
  {
    route: `POST ${ACCOUNTS}`,
    allowed: [Role.ADMIN],
    keys: ACCOUNT_KEYS,
    request: (http) => {
      const email = `alta-${randomUUID()}@ejemplo.com`;
      enrolledEmails.push(email);
      return http.post(ACCOUNTS).send({
        fullName: 'Sofía Ramírez',
        email,
        employeeCode: uniqueEmployeeCode(),
        role: Role.SUPPORT,
      });
    },
    successStatus: 201,
  },
];

/** Métricas (CA-12): Administrador y Operador; solo totales y conteos, nunca filas de una cuenta. */
const METRICS_ROUTE: BackofficeRoute = {
  route: `GET ${METRICS}`,
  allowed: [Role.ADMIN, Role.OPERATOR],
  keys: [
    ...['accounts', 'total', 'clients', 'internal', 'byStatus', 'active', 'suspended'],
    ...['usedBytesTotal', 'byPlan', 'planId', 'name', 'deactivatedAt', 'clientCount'],
  ],
  request: (http) => http.get(METRICS),
};

/** Un plan del catálogo y su conteo de cuentas: ningún dato de una cuenta (CA-8). */
const PLAN_KEYS = [
  ...['id', 'slug', 'name', 'description', 'priceCents'],
  ...[
    'quotaBytes',
    'maxFileBytes',
    'maxEditors',
    'agentQueriesPerMonth',
    'retainedVersions',
    'trashRetentionDays',
  ],
  ...['deactivatedAt', 'clientCount', 'isDefault'],
];

/** Plan que la suite desactiva (se crea en `beforeAll` y se borra al final). */
let catalogPlanId = '';
/** Conexión del dueño, para dejar lista la precondición de la fila. */
let db: DataSource | null = null;

/** Catálogo (CA-8 a CA-11): solo el Administrador; un plan no trae datos de ninguna cuenta. */
const PLAN_ROUTES: readonly BackofficeRoute[] = [
  {
    route: `GET ${PLANS}`,
    allowed: [Role.ADMIN],
    keys: ['items', ...PLAN_KEYS],
    request: (http) => http.get(PLANS),
  },
  {
    route: `POST ${PLANS}`,
    allowed: [Role.ADMIN],
    keys: PLAN_KEYS,
    request: (http) =>
      http.post(PLANS).send({
        name: `${PLAN_NAME_PREFIX}${randomUUID().slice(0, 8)}`,
        description: 'Plan sembrado por la suite de aislamiento',
        priceCents: 4500,
        quotaBytes: '107374182400',
        maxFileBytes: '524288000',
        maxEditors: 3,
        agentQueriesPerMonth: 500,
        retainedVersions: 30,
        trashRetentionDays: 30,
      }),
    successStatus: 201,
  },
  {
    route: `POST ${PLANS}/:id/deactivation`,
    allowed: [Role.ADMIN],
    keys: PLAN_KEYS,
    request: (http) => http.post(`${PLANS}/${catalogPlanId}/deactivation`),
    // Un plan desactivado no se reactiva (RN-4): la suite lo deja activo antes de cada petición.
    prepare: async () => {
      await db?.query('UPDATE plan SET desactivado_en = NULL WHERE id = $1', [catalogPlanId]);
    },
  },
];

/** Cada acción de la 011 (CA-15): T-11 suma aquí el catálogo. */
const ROUTES: readonly BackofficeRoute[] = [
  CLIENT_FILES_ROUTE,
  ...ACCOUNT_ROUTES,
  METRICS_ROUTE,
  ...PLAN_ROUTES,
];

/** Pares rol × ruta según la matriz: los que la ruta admite o los que rechaza (CA-14). */
const casesWhere = (admitted: boolean): [InternalRole, string, BackofficeRoute][] =>
  ROUTES.flatMap((row) =>
    INTERNAL_ROLES.filter((role) => row.allowed.includes(role) === admitted).map(
      (role): [InternalRole, string, BackofficeRoute] => [role, row.route, row],
    ),
  );

/** Todas las claves del cuerpo, en cualquier nivel de anidación. */
const keysOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);
};

const sortedIds = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id).sort();

/**
 * Aislamiento del backoffice como `nimbo_app` (011 CA-15, CA-16, RN-2; RNF-05) contra la API completa: ninguna
 * respuesta de un rol interno trae contenido, texto, URL, clave de objeto ni versiones; consultando por A no aparece
 * nada de B; por SQL el Operador no lee `archivo` ni ningún interno lee `carga`; la consulta de Soporte solo la ve A.
 * Ya cubierto en otras suites: 0 filas de `version_archivo` para roles internos (`storage-versions.iso-spec.ts` ISO-8,
 * 014) y un interno no lee la auditoría del cliente (`audit.iso-spec.ts` ISO-8 e ISO-9, 004).
 */
describe('aislamiento del backoffice (011 CA-15, CA-16)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;
  let owner: DataSource;
  let a: WorldAccount;
  let b: WorldAccount;
  let filesA: WorldFile[];
  let filesB: WorldFile[];
  /** Claves de objeto e ids de versión de A y B, la cuenta de B (id y correo), ids de sus archivos y marcas de URL. */
  let forbidden: string[];

  const send = (account: WorldAccount, row: BackofficeRoute): Test =>
    row
      .request(request(testApp.app.getHttpServer()), a)
      .set('Authorization', `Bearer ${world.tokenFor(account)}`);

  const internalActor = (role: InternalRole): Actor => createActor(world.internals[role].id, role);

  const setStatusOfA = (status: 'activa' | 'suspendida'): Promise<unknown> =>
    owner.query('UPDATE usuario SET estado = $1 WHERE id = $2', [status, a.id]);

  /** La precondición de la fila y la petición. */
  const sendPrepared = async (account: WorldAccount, row: BackofficeRoute): Promise<Response> => {
    if (row.targetStatus !== undefined) await setStatusOfA(row.targetStatus);
    if (row.prepare !== undefined) await row.prepare();
    return send(account, row);
  };

  /** Consume el correo de cada alta creada (nada queda en camino hacia otra suite) y borra las cuentas. */
  const removeEnrolled = async (): Promise<void> => {
    const rows = (await owner.query('SELECT id, correo FROM usuario WHERE correo = ANY($1)', [
      enrolledEmails,
    ])) as { id: string; correo: string }[];
    for (const row of rows) await setupTokenSentTo(row.correo);
    await removeAccounts(
      owner,
      rows.map((row) => row.id),
    );
  };

  const leakedIn = (response: Response): string[] => {
    const serialized = JSON.stringify(response.body);
    return forbidden.filter((value) => serialized.includes(value));
  };

  const worldEvents = async (): Promise<WorldEventRow[]> =>
    (await owner.query(WORLD_EVENTS_SQL, [
      [...world.clients, ...Object.values(world.internals)].map((account) => account.id),
    ])) as WorldEventRow[];

  const forbiddenValues = async (): Promise<string[]> => {
    const rows = (await owner.query(
      'SELECT id, clave_objeto FROM version_archivo WHERE archivo_id = ANY($1)',
      [[...filesA, ...filesB].map((file) => file.id)],
    )) as { id: string; clave_objeto: string }[];
    // Centinela: sin versiones sembradas, ISO-1 pasaría en vacío.
    expect(rows.length).toBeGreaterThan(0);
    const versions = rows.flatMap((row) => [row.id, row.clave_objeto]);
    return [...versions, b.id, b.email, ...filesB.map((file) => file.id), ...URL_MARKERS];
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await createFullApiTestApp(
      buildTestEnv(world.appComposition().env, { withWorkerEnv: true }),
      [NotificationsWorkerModule],
    );
    owner = await connectAsOwner();
    db = owner;
    [a, b] = world.clients;
    filesA = await world.withFiles(testApp, a, TWIN_NAMES);
    filesB = await world.withFiles(testApp, b, TWIN_NAMES);
    await world.withUploads(testApp, a, UPLOADS_PER_CLIENT);
    await world.withUploads(testApp, b, UPLOADS_PER_CLIENT);
    forbidden = await forbiddenValues();
    const [plan] = (await owner.query(
      `INSERT INTO plan (nombre, slug, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
                         consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera)
       SELECT $1, $1, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
              consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera
         FROM plan WHERE slug = 'equipo'
       RETURNING id`,
      [`${PLAN_NAME_PREFIX}${randomUUID().slice(0, 8)}`],
    )) as { id: string }[];
    if (plan === undefined) throw new Error('no se pudo sembrar el plan de la suite');
    catalogPlanId = plan.id;
  });

  afterAll(async () => {
    await removeEnrolled();
    await owner?.query('DELETE FROM plan WHERE nombre LIKE $1', [`${PLAN_NAME_PREFIX}%`]);
    await testApp?.close();
    await owner?.destroy();
    await world?.close();
  });

  describe('rol interno × ruta (CA-14, CA-15)', () => {
    afterEach(async () => {
      await setStatusOfA('activa');
    });

    it.each(casesWhere(true))(
      'ISO-1 (CA-15): %s no puede recibir contenido, texto, URL, clave de objeto ni versiones por `%s`',
      async (role, _route, row) => {
        const response = await sendPrepared(world.internals[role], row);

        expect(response.status).toBe(row.successStatus ?? 200);
        expect(keysOf(response.body).filter((key) => !row.keys.includes(key))).toEqual([]);
        expect(leakedIn(response)).toEqual([]);
      },
    );

    it.each(casesWhere(false))(
      'ISO-2 (CA-14): %s no puede usar `%s`: 403',
      async (role, _route, row) => {
        const response = await sendPrepared(world.internals[role], row);

        expect({ status: response.status, code: response.body.code }).toEqual({
          status: 403,
          code: 'SHARED_FORBIDDEN',
        });
      },
    );

    it('ISO-2 (CA-14, RN-2): el 403 de OPERATOR no puede dejar ningún evento de auditoría sobre A ni sobre nadie del mundo', async () => {
      const before = sortedIds(await worldEvents());

      expect((await send(world.internals[Role.OPERATOR], CLIENT_FILES_ROUTE)).status).toBe(403);
      expect(sortedIds(await worldEvents())).toEqual(before);

      // Centinela: la consulta de Soporte sí suma su evento sobre A; si no, lo anterior pasaría en vacío.
      expect((await send(world.internals[Role.SUPPORT], CLIENT_FILES_ROUTE)).status).toBe(200);
      const added = (await worldEvents()).filter((event) => !before.includes(event.id));
      expect(added).toMatchObject([
        { targetUserId: a.id, actorId: world.internals[Role.SUPPORT].id },
      ]);
    });

    it.each(METRICS_ROUTE.allowed)(
      'ISO-3 (CA-12, CA-15): %s no puede recibir en las métricas el id ni el correo de A ni de B',
      async (role) => {
        const response = await send(world.internals[role], METRICS_ROUTE);
        expect(response.status).toBe(200);
        const serialized = JSON.stringify(response.body);

        expect(
          [a.id, a.email, b.id, b.email].filter((value) => serialized.includes(value)),
        ).toEqual([]);
      },
    );

    it.each(CLIENT_FILES_ROUTE.allowed)(
      'ISO-3 (CA-13, CA-15): %s no puede ver archivos de B consultando por A: solo los ids de A',
      async (role) => {
        const response = await send(world.internals[role], CLIENT_FILES_ROUTE);
        const body = response.body as { client: { id: string }; items: { id: string }[] };

        expect(body.client.id).toBe(a.id);
        expect(sortedIds(body.items)).toEqual(sortedIds(filesA));
      },
    );
  });

  describe('RLS de `archivo` y `carga` como `nimbo_app` (CA-15, RNF-05)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const visibleIds = async (actor: Actor, sql: string, ids: string[]): Promise<string[]> =>
      sortedIds(
        await runner.withActor(actor, () => context.requireActorScope(actor).query(sql, [ids])),
      );

    const worldFileIds = (): string[] => sortedIds([...filesA, ...filesB]);

    beforeAll(() => {
      runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER, { strict: false });
      context = testApp.app.get(TransactionContext, { strict: false });
    });

    it('ISO-4 (CA-15): OPERATOR no puede ver filas de `archivo` de A ni de B aunque A sí vea las suyas', async () => {
      const operator = internalActor(Role.OPERATOR);

      expect(await visibleIds(operator, FILES_SQL, worldFileIds())).toEqual([]);
      expect(await visibleIds(createActor(a.id, Role.CLIENT), FILES_SQL, worldFileIds())).toEqual(
        sortedIds(filesA),
      );
    });

    it.each(CLIENT_FILES_ROUTE.allowed)(
      'ISO-5 (CA-15): %s no puede ver filas de `carga`, aunque sí lee los metadatos de `archivo`',
      async (role) => {
        const internal = internalActor(role);

        expect(await visibleIds(internal, FILES_SQL, worldFileIds())).toEqual(worldFileIds());
        expect(await visibleIds(internal, UPLOADS_SQL, [a.id, b.id])).toEqual([]);
        expect(await visibleIds(createActor(a.id, Role.CLIENT), UPLOADS_SQL, [a.id])).toHaveLength(
          UPLOADS_PER_CLIENT,
        );
      },
    );
  });

  /**
   * Las funciones de `suscripcion` de la 011b y las columnas del extra (plan §6, casos 6 y 7; ADR-0035): solo el
   * Administrador las ejecuta y el cliente no se sube la cuota ni por `UPDATE` ni por `INSERT`. Todo como `nimbo_app`.
   */
  describe('ajustes de `suscripcion` como `nimbo_app` (011b CA-1, CA-3; RNF-05)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;
    let newcomer: Actor;
    const until = new Date(Date.now() + 3 * 86_400_000);
    const limitsSql = 'SELECT * FROM limites_de_cuenta($1)';
    const calls: readonly [string, string, unknown[]][] = [
      ['limites_de_cuenta', limitsSql, []],
      ['ajustar_cuota_extra', 'SELECT * FROM ajustar_cuota_extra($1, $2, $3)', ['1024', until]],
      ['extender_vigencia', 'SELECT * FROM extender_vigencia($1, $2)', [until]],
    ];

    const asActor = (actor: Actor, sql: string, params: unknown[]): Promise<unknown> =>
      runner.withActor(actor, () => context.requireActorScope(actor).query(sql, params));

    const extraOf = async (userId: string): Promise<unknown> =>
      (
        (await owner.query(
          'SELECT cuota_extra_bytes AS extra, cuota_extra_hasta AS hasta FROM suscripcion WHERE usuario_id = $1',
          [userId],
        )) as { extra: string; hasta: Date | null }[]
      )[0];

    beforeAll(async () => {
      runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER, { strict: false });
      context = testApp.app.get(TransactionContext, { strict: false });
      await owner.query(
        `INSERT INTO suscripcion (usuario_id, plan_id) SELECT id, '10000000-0000-4000-8000-000000000002'
           FROM usuario WHERE id = ANY($1) ON CONFLICT (usuario_id) DO NOTHING`,
        [[a.id, b.id]],
      );
      newcomer = createActor(await insertAccount(owner), Role.CLIENT);
    });

    afterAll(async () => {
      await removeAccounts(owner, [newcomer.id]);
    });

    it.each([Role.SUPPORT, Role.OPERATOR, Role.CLIENT] as const)(
      'ISO-6 (plan §6 caso 6): %s no puede ejecutar ninguna de las tres funciones de `suscripcion`',
      async (role) => {
        const actor = role === Role.CLIENT ? createActor(a.id, role) : internalActor(role);

        for (const [name, sql, params] of calls) {
          await expect(asActor(actor, sql, [a.id, ...params])).rejects.toThrow(
            new RegExp(`${name} solo la usa un administrador`),
          );
        }
        expect(await extraOf(a.id)).toEqual({ extra: '0', hasta: null });
      },
    );

    it('ISO-6 (plan §6 caso 6): sin actor en la sesión ninguna corre; el Administrador sí (centinela)', async () => {
      for (const [name, sql, params] of calls) {
        await expect(
          runner.run(() => context.manager().query(sql, [a.id, ...params])),
        ).rejects.toThrow(new RegExp(`${name} solo la usa un administrador`));
      }

      expect(await asActor(internalActor(Role.ADMIN), limitsSql, [a.id])).toHaveLength(1);
    });

    it('ISO-7 (plan §6 caso 7): A no puede subirse la cuota por `UPDATE`, aunque sí cambia una columna concedida', async () => {
      const ana = createActor(a.id, Role.CLIENT);

      await expect(
        asActor(
          ana,
          'UPDATE suscripcion SET cuota_extra_bytes = $2, cuota_extra_hasta = $3 WHERE usuario_id = $1',
          [a.id, '1099511627776', until],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asActor(ana, 'UPDATE suscripcion SET renovacion_automatica = true WHERE usuario_id = $1', [
          a.id,
        ]),
      ).resolves.toBeDefined();
      expect(await extraOf(a.id)).toEqual({ extra: '0', hasta: null });
    });

    it('ISO-7 (plan §6 caso 7): un cliente no puede darse de alta con extra; sin extra, sí (centinela)', async () => {
      const insert = (extra: string, hasta: Date | null) =>
        asActor(
          newcomer,
          `INSERT INTO suscripcion (usuario_id, plan_id, cuota_extra_bytes, cuota_extra_hasta)
           VALUES ($1, '10000000-0000-4000-8000-000000000001', $2, $3)`,
          [newcomer.id, extra, hasta],
        );

      await expect(insert('1099511627776', until)).rejects.toThrow(/row-level security/);
      await expect(insert('0', null)).resolves.toBeDefined();
      expect(await extraOf(newcomer.id)).toEqual({ extra: '0', hasta: null });
    });
  });

  /**
   * Las rutas de ajustes de la 011b contra la API completa (spec §5, CA-9, CA-15, CA-16; ADR-0035): la respuesta del
   * Administrador es la lista blanca de límites, sin nada de B ni de archivos; el evento queda solo en la actividad de
   * A; B no cambia. Por SQL, las políticas `TO CURRENT_USER` del dueño no se extienden a `nimbo_app`.
   */
  describe('ajustes de cuota y vigencia sobre A (011b CA-9, CA-15, CA-16; RNF-05)', () => {
    const LIMITS_KEYS = [
      ...['status', 'planName', 'usedBytes', 'baseQuotaBytes', 'extraQuotaBytes'],
      ...['extraQuotaUntil', 'totalQuotaBytes', 'expiresAt'],
    ];
    const SUBSCRIPTION_SQL = `SELECT plan_id, vence_en, estado, cuota_extra_bytes, cuota_extra_hasta
      FROM suscripcion WHERE usuario_id = $1`;
    const guatemalaDay = (offsetDays: number): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(
        new Date(Date.now() + offsetDays * 86_400_000),
      );
    const putQuota = (http: Http): Test =>
      http.put(`${ACCOUNTS}/${a.id}/quota`).send({ extraBytes: '1024', until: guatemalaDay(3) });
    const putValidity = (http: Http): Test =>
      http.put(`${ACCOUNTS}/${a.id}/validity`).send({ expiresAt: guatemalaDay(40) });
    const adjustments: readonly [string, (http: Http) => Test][] = [
      ['GET :id/limits', (http) => http.get(`${ACCOUNTS}/${a.id}/limits`)],
      ['PUT :id/quota', putQuota],
      ['DELETE :id/quota', (http) => http.delete(`${ACCOUNTS}/${a.id}/quota`)],
      ['PUT :id/validity', putValidity],
    ];
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const sendAs = (account: WorldAccount, build: (http: Http) => Test): Test =>
      build(request(testApp.app.getHttpServer())).set(
        'Authorization',
        `Bearer ${world.tokenFor(account)}`,
      );

    const subscriptionOf = async (userId: string): Promise<unknown> =>
      ((await owner.query(SUBSCRIPTION_SQL, [userId])) as unknown[])[0];

    const myEvents = async (account: WorldAccount): Promise<AuditEventResponse[]> => {
      const response = await sendAs(account, (http) => http.get(MY_EVENTS));
      expect(response.status).toBe(200);
      return listAuditEventsResponseSchema.parse(response.body).items;
    };

    beforeAll(async () => {
      runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER, { strict: false });
      context = testApp.app.get(TransactionContext, { strict: false });
      // A y B con un plan de pago vigente dos días más; como dueño, son fixtures.
      await owner.query(
        `INSERT INTO suscripcion (usuario_id, plan_id) SELECT id, '10000000-0000-4000-8000-000000000002'
           FROM usuario WHERE id = ANY($1) ON CONFLICT (usuario_id) DO NOTHING`,
        [[a.id, b.id]],
      );
      await owner.query(
        `UPDATE suscripcion SET vence_en = now() + interval '2 days', estado = 'vigente',
           cuota_extra_bytes = 0, cuota_extra_hasta = NULL WHERE usuario_id = ANY($1)`,
        [[a.id, b.id]],
      );
    });

    afterAll(async () => {
      await owner.query(
        `UPDATE suscripcion SET vence_en = NULL, estado = 'vigente', cuota_extra_bytes = 0,
           cuota_extra_hasta = NULL WHERE usuario_id = ANY($1)`,
        [[a.id, b.id]],
      );
    });

    it.each(adjustments)(
      'ISO-8 (011b CA-15): ADMIN no puede recibir por `%s` sobre A nada fuera de los límites, ni datos de B o de archivos',
      async (_route, build) => {
        const response = await sendAs(world.internals[Role.ADMIN], build);

        expect(response.status).toBe(200);
        expect(keysOf(response.body).filter((key) => !LIMITS_KEYS.includes(key))).toEqual([]);
        expect(leakedIn(response)).toEqual([]);
      },
    );

    it.each([Role.SUPPORT, Role.OPERATOR] as const)(
      'ISO-9 (011b CA-16): %s no puede ajustar la cuota ni la vigencia de A: 403, A intacta y sin evento',
      async (role) => {
        const before = { a: await subscriptionOf(a.id), events: sortedIds(await worldEvents()) };

        for (const [, build] of adjustments) {
          const response = await sendAs(world.internals[role], build);
          expect({ status: response.status, code: response.body.code }).toEqual({
            status: 403,
            code: 'SHARED_FORBIDDEN',
          });
        }
        expect(await subscriptionOf(a.id)).toEqual(before.a);
        expect(sortedIds(await worldEvents())).toEqual(before.events);
      },
    );

    it('ISO-9 (011b CA-16): B no puede ajustar la cuota ni la vigencia de A ni leer sus límites: 403', async () => {
      const before = await subscriptionOf(a.id);

      for (const [, build] of adjustments) {
        const response = await sendAs(b, build);
        expect({ status: response.status, code: response.body.code }).toEqual({
          status: 403,
          code: 'SHARED_FORBIDDEN',
        });
      }
      expect(await subscriptionOf(a.id)).toEqual(before);
    });

    it('ISO-10 (011b CA-9, RN-4): B no puede ver ni sufrir los ajustes sobre A; A los ve con el rol ADMIN y sin datos del interno', async () => {
      const admin = world.internals[Role.ADMIN];
      // ISO-8 ya extendió la vigencia de A a ese día: vuelve a dos días para que el ajuste sea una extensión.
      await owner.query(
        "UPDATE suscripcion SET vence_en = now() + interval '2 days' WHERE usuario_id = $1",
        [a.id],
      );
      const beforeB = { row: await subscriptionOf(b.id), events: await myEvents(b) };
      const beforeA = (await myEvents(a)).map((event) => event.id);

      const quota = await sendAs(admin, putQuota);
      const validity = await sendAs(admin, putValidity);
      expect([quota.status, validity.status]).toEqual([200, 200]);

      const added = (await myEvents(a)).filter((event) => !beforeA.includes(event.id));
      expect(added.map((event) => event.action).sort()).toEqual(
        [AuditAction.ACCOUNT_QUOTA_ADJUSTED, AuditAction.ACCOUNT_VALIDITY_ADJUSTED].sort(),
      );
      for (const event of added) {
        expect(event).toMatchObject({ actorRole: Role.ADMIN, origin: 'staff' });
      }
      const serialized = JSON.stringify(added);
      expect(
        [admin.name, admin.email, b.id, b.email].filter((value) => serialized.includes(value)),
      ).toEqual([]);
      expect(await subscriptionOf(b.id)).toEqual(beforeB.row);
      expect(await myEvents(b)).toEqual(beforeB.events);
    });

    it('ISO-11 (ADR-0035): ADMIN como `nimbo_app` no puede leer ni escribir `suscripcion` de A sin las funciones', async () => {
      const admin = internalActor(Role.ADMIN);
      const asAdmin = (sql: string, params: unknown[]): Promise<unknown> =>
        runner.withActor(admin, () => context.requireActorScope(admin).query(sql, params));
      const before = await subscriptionOf(a.id);

      expect(await asAdmin('SELECT id FROM suscripcion WHERE usuario_id = $1', [a.id])).toEqual([]);
      await expect(
        asAdmin('UPDATE suscripcion SET cuota_extra_bytes = 1 WHERE usuario_id = $1', [a.id]),
      ).rejects.toThrow(/permission denied/);
      await asAdmin(
        "UPDATE suscripcion SET vence_en = now() + interval '9 years', estado = 'vigente' WHERE usuario_id = $1",
        [a.id],
      );
      expect(await subscriptionOf(a.id)).toEqual(before);
      // Centinela: la función sí lee la fila de A con el mismo actor.
      expect(await asAdmin('SELECT * FROM limites_de_cuenta($1)', [a.id])).toHaveLength(1);
    });
  });

  describe('la consulta de Soporte sobre A en «Mi actividad» (CA-16, RN-2)', () => {
    let support: WorldAccount;
    let viewed: AuditEventResponse;

    const myEvents = async (account: WorldAccount) => {
      const response = await request(testApp.app.getHttpServer())
        .get(MY_EVENTS)
        .set('Authorization', `Bearer ${world.tokenFor(account)}`);
      expect(response.status).toBe(200);
      return listAuditEventsResponseSchema.parse(response.body);
    };

    const myEventIds = async (account: WorldAccount): Promise<string[]> =>
      (await myEvents(account)).items.map((event) => event.id);

    /** El único evento nuevo de A tras la consulta de Soporte (las de ISO-1 e ISO-3 ya estaban). */
    beforeAll(async () => {
      support = world.internals[Role.SUPPORT];
      const before = await myEventIds(a);
      expect((await send(support, CLIENT_FILES_ROUTE)).status).toBe(200);
      const added = (await myEvents(a)).items.filter((event) => !before.includes(event.id));
      expect(added).toHaveLength(1);
      [viewed] = added as [AuditEventResponse];
    });

    it('ISO-6 (CA-16): B no puede ver en su actividad la consulta de Soporte sobre A', async () => {
      expect(await myEventIds(b)).not.toContain(viewed.id);
    });

    it('ISO-7 (CA-16): Soporte no puede ver en su actividad su consulta sobre A', async () => {
      expect(await myEventIds(support)).not.toContain(viewed.id);
    });

    it('CA-16: A ve la consulta con el rol SUPPORT y origen `staff`, sin el nombre ni el correo del interno', () => {
      expect(viewed).toMatchObject({
        action: AuditAction.CLIENT_FILES_VIEWED,
        actorRole: Role.SUPPORT,
        origin: 'staff',
      });
      const serialized = JSON.stringify(viewed);
      expect([support.name, support.email].filter((value) => serialized.includes(value))).toEqual(
        [],
      );
    });
  });
});
