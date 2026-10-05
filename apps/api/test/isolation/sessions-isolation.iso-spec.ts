import { randomBytes, randomUUID } from 'node:crypto';

import { sessionListResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { Role } from '../../src/shared';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner } from '../support/database-urls';

import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const SESSIONS = '/api/v1/sessions';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
/** Sesiones por cuenta: suficientes para que `revoke-others` tenga qué cerrar. */
const SESSIONS_PER_ACCOUNT = 2;

/** Estado de las sesiones de todas las cuentas, para comprobar que un intento ajeno no cambió nada. */
type SessionStates = readonly { readonly id: string; readonly revocada_en: Date | null }[];

/**
 * Aislamiento de sesiones (002 CA-11, CA-12; RNF-05, Art. IX) sobre el mundo de 003 con tokens reales: cada cuenta,
 * cliente o interna, ve y cierra solo sus sesiones. Cerrar una ajena es el mismo `404` que una inexistente y la base
 * queda igual; «cerrar las demás» no toca otra cuenta.
 */
describe('aislamiento de sesiones (CA-11, CA-12)', () => {
  let world: IsolationWorld;
  let owner: DataSource;
  let testApp: TestApp;
  const sessionsOf = new Map<string, string[]>();

  const accounts = (): readonly WorldAccount[] => [
    ...world.clients,
    ...Object.values(world.internals),
  ];

  const as = (account: WorldAccount) => {
    const server = (): ReturnType<typeof request> => request(testApp.app.getHttpServer());
    const bearer = `Bearer ${world.tokenFor(account)}`;
    return {
      get: (path: string) => server().get(path).set('Authorization', bearer),
      delete: (path: string) => server().delete(path).set('Authorization', bearer),
      post: (path: string) => server().post(path).set('Authorization', bearer),
    };
  };

  /** Una sesión activa con su dispositivo, insertada como el dueño de las tablas (*fixture*). */
  const insertSession = async (userId: string): Promise<string> => {
    const [device] = (await owner.query(
      `INSERT INTO dispositivo (usuario_id, huella_hash, agente_usuario, ultima_ip, ultimo_acceso)
       VALUES ($1, $2, $3, '203.0.113.7', now()) RETURNING id`,
      [userId, randomBytes(32).toString('hex'), FIREFOX],
    )) as { id: string }[];
    const id = randomUUID();
    await owner.query(
      `INSERT INTO sesion (id, usuario_id, dispositivo_id, refresh_hash, creada_en, ultimo_uso, expira_en)
       VALUES ($1, $2, $3, $4, now() - interval '1 hour', now() - interval '1 hour',
               now() + interval '29 days')`,
      [id, userId, device?.id, randomBytes(32).toString('hex')],
    );
    return id;
  };

  const states = async (): Promise<SessionStates> =>
    (await owner.query(
      'SELECT id, revocada_en FROM sesion WHERE usuario_id = ANY($1) ORDER BY id',
      [accounts().map((account) => account.id)],
    )) as SessionStates;

  const listedIds = async (account: WorldAccount): Promise<readonly string[]> => {
    const response = await as(account).get(SESSIONS);
    expect(response.status).toBe(200);
    return sessionListResponseSchema.parse(response.body).items.map((item) => item.id);
  };

  const idsOf = (account: WorldAccount): readonly string[] => sessionsOf.get(account.id) ?? [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    world = await createIsolationWorld();
    for (const account of accounts()) {
      const ids: string[] = [];
      for (let index = 0; index < SESSIONS_PER_ACCOUNT; index += 1) {
        ids.push(await insertSession(account.id));
      }
      sessionsOf.set(account.id, ids);
    }
    testApp = await world.appAs();
  });

  afterAll(async () => {
    await testApp?.close();
    await owner?.destroy();
    await world?.close();
  });

  it.each([
    ['el cliente A', () => world.clients[0]],
    ['el cliente B', () => world.clients[1]],
    ['el administrador', () => world.internals[Role.ADMIN]],
    ['soporte', () => world.internals[Role.SUPPORT]],
    ['el operador', () => world.internals[Role.OPERATOR]],
  ])('CA-11: %s ve solo sus sesiones', async (_who, accountOf) => {
    const account = accountOf();

    const listed = await listedIds(account);

    expect([...listed].sort()).toEqual([...idsOf(account)].sort());
  });

  it('CA-12: cerrar una sesión del otro cliente → el mismo `404` que una inexistente y la base sin cambios', async () => {
    const [ana, beto] = world.clients;
    const [betoSession] = idsOf(beto);
    const before = await states();

    const foreign = await as(ana).delete(`${SESSIONS}/${betoSession ?? ''}`);
    const missing = await as(ana).delete(`${SESSIONS}/${randomUUID()}`);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: 'IDENTITY_SESSION_NOT_FOUND' });
    const { correlationId: _foreignId, ...foreignBody } = foreign.body as Record<string, unknown>;
    const { correlationId: _missingId, ...missingBody } = missing.body as Record<string, unknown>;
    expect(foreignBody).toEqual(missingBody);
    expect(missing.status).toBe(404);
    expect(await states()).toEqual(before);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'CA-12: %s no cierra la sesión de un cliente, pero sí una suya',
    async (role) => {
      const internal = world.internals[role];
      const [clientSession] = idsOf(world.clients[0]);
      const [ownSession] = idsOf(internal);
      const before = await states();

      const foreign = await as(internal).delete(`${SESSIONS}/${clientSession ?? ''}`);

      expect(foreign.status).toBe(404);
      expect(await states()).toEqual(before);
      const own = await as(internal).delete(`${SESSIONS}/${ownSession ?? ''}`);
      expect(own.status).toBe(204);
      expect(await listedIds(internal)).not.toContain(ownSession);
    },
  );

  it('CA-13: `revoke-others` de un cliente no toca las sesiones de la otra cuenta', async () => {
    const [ana, beto] = world.clients;
    const betoBefore = await listedIds(beto);

    const response = await as(ana).post(`${SESSIONS}/revoke-others`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ revokedCount: SESSIONS_PER_ACCOUNT });
    expect(await listedIds(ana)).toEqual([]);
    expect(await listedIds(beto)).toEqual(betoBefore);
  });
});
