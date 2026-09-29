import request from 'supertest';

import { ALL_ROLES, createActor, Role } from '../../src/shared';
import type { TestApp } from '../int/setup/test-app';

import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const OK = 200;
const FORBIDDEN = 403;

/** Rutas sonda por rol (plan 003 §5) y los roles que cada una admite. */
const CLIENT_ROUTE = ['client', [Role.CLIENT]] as const;
const INTERNAL_ROUTES = [
  ['admin', [Role.ADMIN]],
  ['support', [Role.SUPPORT]],
  ['operator', [Role.OPERATOR]],
  ['admin-or-support', [Role.ADMIN, Role.SUPPORT]],
] as const;

const EXPECTED_BODY = {
  [OK]: { ok: true },
  [FORBIDDEN]: expect.objectContaining({ code: 'SHARED_FORBIDDEN' }) as unknown,
};

const casesFor = (routes: readonly (readonly [string, readonly Role[]])[]) =>
  routes.flatMap(([route, allowed]) =>
    ALL_ROLES.map((role) => [route, role, allowed.includes(role) ? OK : FORBIDDEN] as const),
  );

/**
 * Roles y `Actor` con las cuentas del mundo de aislamiento, como `nimbo_app` (003 CA-4, CA-5, CA-6, CA-15). La
 * suplantación usa el `id` real del **otro** cliente: el ataque que CA-4 cierra. Hasta 002-PR-2, `TestJwtStrategy`
 * no consulta `usuario`: el `id` y el rol salen del token firmado, no de la fila de la cuenta.
 */
describe('roles y Actor en la suite de aislamiento (CA-4, CA-5, CA-6)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;

  const accountFor = (role: Role): WorldAccount =>
    role === Role.CLIENT ? world.clients[0] : world.internals[role];
  const server = (): Parameters<typeof request>[0] => testApp.app.getHttpServer();
  const bearer = (account: WorldAccount): string => `Bearer ${world.tokenFor(account)}`;

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await world.appAs();
  });

  afterAll(async () => {
    await testApp?.close();
    await world?.close();
  });

  describe('CA-4: el `Actor` sale del token y no de la petición', () => {
    it('CA-4: el `id` del otro cliente en la ruta, la consulta y las cabeceras no cambia el `Actor`', async () => {
      const [me, other] = world.clients;

      const response = await request(server())
        .get(`/api/v1/__probe/actor/${other.id}`)
        .query({ id: other.id, userId: other.id, role: Role.ADMIN, actor: other.id })
        .set('Authorization', bearer(me))
        .set('x-user-id', other.id)
        .set('x-actor-role', Role.ADMIN)
        .set('x-forwarded-user', other.email);

      expect(response.status).toBe(OK);
      expect(response.body).toEqual(createActor(me.id, Role.CLIENT));
    });

    it('CA-4: el `id` del otro cliente o un rol interno en el cuerpo no cambia el `Actor`', async () => {
      const [me, other] = world.clients;

      const response = await request(server())
        .post('/api/v1/__probe/actor')
        .set('Authorization', bearer(me))
        .send({
          id: other.id,
          userId: other.id,
          role: Role.ADMIN,
          actor: createActor(other.id, Role.ADMIN),
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createActor(me.id, Role.CLIENT));
    });

    it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
      'CA-4: una cuenta %s que envía el `id` y el rol de un cliente sigue siendo ella misma',
      async (role) => {
        const internal = world.internals[role];
        const [client] = world.clients;

        const response = await request(server())
          .get(`/api/v1/__probe/actor/${client.id}`)
          .query({ id: client.id, role: Role.CLIENT })
          .set('Authorization', bearer(internal))
          .set('x-user-id', client.id)
          .set('x-actor-role', Role.CLIENT);

        expect(response.status).toBe(OK);
        expect(response.body).toEqual(createActor(internal.id, role));
      },
    );
  });

  it.each(casesFor([CLIENT_ROUTE]))(
    'CA-5: `/__probe/%s` con la cuenta %s → %i',
    async (route, role, status) => {
      const response = await request(server())
        .get(`/api/v1/__probe/${route}`)
        .set('Authorization', bearer(accountFor(role)));

      expect(response.status).toBe(status);
      expect(response.body).toEqual(EXPECTED_BODY[status]);
    },
  );

  it.each(casesFor(INTERNAL_ROUTES))(
    'CA-6: `/__probe/%s` con la cuenta %s → %i',
    async (route, role, status) => {
      const response = await request(server())
        .get(`/api/v1/__probe/${route}`)
        .set('Authorization', bearer(accountFor(role)));

      expect(response.status).toBe(status);
      expect(response.body).toEqual(EXPECTED_BODY[status]);
    },
  );
});
