import { listAuditEventsResponseSchema } from '@nimbo/contracts';
import type { AuditEventResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import type { DataSource } from 'typeorm';

import { AuditAction } from '../../src/modules/audit';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { buildTestEnv } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner } from '../support/database-urls';
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
const MY_EVENTS = '/api/v1/audit/my-events';
/** A y B tienen archivos con los mismos nombres: nada los distingue salvo el dueño. */
const TWIN_NAMES = ['Contrato.txt', 'Contrato (1).txt'];
/** Marcas de una URL (firmada o no) que ninguna respuesta del backoffice puede traer. */
const URL_MARKERS = ['http', 'X-Amz-'];
/** Una carga en curso por cliente: ningún rol interno lee `carga`. */
const UPLOADS_PER_CLIENT = 1;
const FILES_SQL = 'SELECT id FROM archivo WHERE id = ANY($1) ORDER BY id';
const UPLOADS_SQL = 'SELECT id FROM carga WHERE propietario_id = ANY($1) ORDER BY id';

type Http = ReturnType<typeof request>;

/** Una acción del backoffice: quién la usa, qué claves puede traer su respuesta y la petición sobre la cuenta de A. */
interface BackofficeRoute {
  readonly route: string;
  readonly allowed: readonly InternalRole[];
  /** Lista blanca de claves, en cualquier nivel del cuerpo: sin contenido, texto, URL, clave de objeto ni versiones. */
  readonly keys: readonly string[];
  /** La petición sin el token, que pone la tabla. */
  readonly request: (http: Http, target: WorldAccount) => Test;
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

/** Cada acción de la 011 (CA-15): T-10 y T-11 suman aquí cuentas, métricas y catálogo. */
const ROUTES: readonly BackofficeRoute[] = [CLIENT_FILES_ROUTE];

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
  /** Claves de objeto e ids de versión de A y B, ids de archivos de B y marcas de URL. */
  let forbidden: string[];

  const send = (account: WorldAccount, row: BackofficeRoute): Test =>
    row
      .request(request(testApp.app.getHttpServer()), a)
      .set('Authorization', `Bearer ${world.tokenFor(account)}`);

  const leakedIn = (response: Response): string[] => {
    const serialized = JSON.stringify(response.body);
    return forbidden.filter((value) => serialized.includes(value));
  };

  const forbiddenValues = async (): Promise<string[]> => {
    const rows = (await owner.query(
      'SELECT id, clave_objeto FROM version_archivo WHERE archivo_id = ANY($1)',
      [[...filesA, ...filesB].map((file) => file.id)],
    )) as { id: string; clave_objeto: string }[];
    // Centinela: sin versiones sembradas, ISO-1 pasaría en vacío.
    expect(rows.length).toBeGreaterThan(0);
    const versions = rows.flatMap((row) => [row.id, row.clave_objeto]);
    return [...versions, ...filesB.map((file) => file.id), ...URL_MARKERS];
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await createFullApiTestApp(buildTestEnv(world.appComposition().env));
    owner = await connectAsOwner();
    [a, b] = world.clients;
    filesA = await world.withFiles(testApp, a, TWIN_NAMES);
    filesB = await world.withFiles(testApp, b, TWIN_NAMES);
    await world.withUploads(testApp, a, UPLOADS_PER_CLIENT);
    await world.withUploads(testApp, b, UPLOADS_PER_CLIENT);
    forbidden = await forbiddenValues();
  });

  afterAll(async () => {
    await testApp?.close();
    await owner?.destroy();
    await world?.close();
  });

  describe('rol interno × ruta (CA-14, CA-15)', () => {
    it.each(casesWhere(true))(
      'ISO-1 (CA-15): %s no puede recibir contenido, texto, URL, clave de objeto ni versiones por `%s`',
      async (role, _route, row) => {
        const response = await send(world.internals[role], row);

        expect(response.status).toBe(200);
        expect(keysOf(response.body).filter((key) => !row.keys.includes(key))).toEqual([]);
        expect(leakedIn(response)).toEqual([]);
      },
    );

    it.each(casesWhere(false))(
      'ISO-2 (CA-14): %s no puede usar `%s`: 403',
      async (role, _route, row) => {
        const response = await send(world.internals[role], row);

        expect({ status: response.status, code: response.body.code }).toEqual({
          status: 403,
          code: 'SHARED_FORBIDDEN',
        });
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
    const internalActor = (role: InternalRole): Actor =>
      createActor(world.internals[role].id, role);

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
