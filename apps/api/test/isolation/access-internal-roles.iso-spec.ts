import {
  AccessLevel,
  accessibleNodes,
  AccessModule,
  Action,
  PermissionResolver,
} from '../../src/modules/access';
import { I_ACCESS_LEVEL_READER } from '../../src/modules/access/application/i-access-level-reader.port';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import type { TestApp } from '../int/setup/test-app';

import { createIsolationWorld } from './setup/isolation-world';
import type { InternalRole, IsolationWorld } from './setup/isolation-world';

const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];
/** Todas las acciones de `access` son sobre el contenido de un nodo. */
const CONTENT_ACTIONS = Object.values(Action);

/**
 * Roles internos sin contenido, contra Postgres y como `nimbo_app` (003 CA-9, CA-15; plan §6.5): `PermissionResolver`
 * real dentro de `withActor` y `accessibleNodes` ejecutado como subconsulta. Los nodos son cuentas reales del mundo,
 * así que sin el filtro la consulta sí devolvería filas. En 003 `accessibleNodes` es el conjunto vacío para **todos**
 * los roles, así que el 0 filas y el `null` del lector real no distinguen a un interno de un cliente; lo que sí falla
 * si se rompe CA-9 es el caso con un lector que daría `OWNER`. El control positivo (el cliente dueño ve su archivo y
 * el interno no) llega con 005 (CA-10).
 */
describe('roles internos sin contenido, contra la base (CA-9)', () => {
  let world: IsolationWorld;
  let testApp: TestApp | undefined;
  let resolver: PermissionResolver;
  let runner: ITransactionRunner;
  let context: TransactionContext;

  const actorOf = (role: InternalRole): Actor => createActor(world.internals[role].id, role);
  const worldIds = (): string[] => [
    ...world.clients.map((client) => client.id),
    ...Object.values(world.internals).map((internal) => internal.id),
  ];

  /** Cuentas del mundo; con `onlyAccessible`, filtradas por `accessibleNodes(actor)` en el SQL. */
  const selectWorldIds = (actor: Actor, onlyAccessible: boolean): Promise<unknown[]> => {
    const query = context
      .requireActorScope(actor)
      .createQueryBuilder()
      .select('u.id', 'id')
      .from('usuario', 'u')
      .where('u.id = ANY(:ids)', { ids: worldIds() });
    if (!onlyAccessible) return query.getRawMany();
    const fragment = accessibleNodes(actor);
    return query
      .andWhere(`u.id IN (SELECT nodo_id FROM (${fragment.sql}) accesibles)`, {
        ...fragment.parameters,
      })
      .getRawMany();
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await world.appAs({ modules: [AccessModule] });
    resolver = testApp.app.get(PermissionResolver);
    runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    context = testApp.app.get(TransactionContext);
  });

  afterAll(async () => {
    await testApp?.close();
    await world?.close();
  });

  describe.each(INTERNAL_ROLES)('como la cuenta %s', (role) => {
    it('CA-9: `levelFor` da `null` sobre los nodos del mundo', async () => {
      const actor = actorOf(role);

      const levels = await runner.withActor(actor, () =>
        Promise.all(worldIds().map((id) => resolver.levelFor(actor, id))),
      );

      expect(levels.every((level) => level === null)).toBe(true);
    });

    it.each(CONTENT_ACTIONS)(
      'CA-9: `can(%s)` da `false` sobre el nodo de un cliente',
      async (action) => {
        const actor = actorOf(role);

        const allowed = await runner.withActor(actor, () =>
          resolver.can(actor, world.clients[0].id, action),
        );

        expect(allowed).toBe(false);
      },
    );

    it('CA-9: `accessibleNodes` como subconsulta da 0 filas (sin el filtro, las mismas cuentas sí aparecen)', async () => {
      const actor = actorOf(role);

      const [unfiltered, accessible] = await runner.withActor(actor, async () => [
        await selectWorldIds(actor, false),
        await selectWorldIds(actor, true),
      ]);

      expect(unfiltered).toHaveLength(worldIds().length);
      expect(accessible).toEqual([]);
    });
  });
});

/**
 * CA-9 «sin consultar a quién pertenece el recurso»: con un lector que daría `OWNER` a cualquiera, un interno sigue
 * recibiendo `null`/`false` y el lector no se llama. Así la prueba falla si se quita el corte de `PermissionResolver`.
 */
describe('roles internos sin contenido aunque el lector diera OWNER (CA-9)', () => {
  const ownerForAnyone = { levelFor: jest.fn(async () => AccessLevel.OWNER) };
  let world: IsolationWorld;
  let testApp: TestApp | undefined;
  let resolver: PermissionResolver;
  let runner: ITransactionRunner;

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await world.appAs({
      modules: [AccessModule],
      overrides: [{ provide: I_ACCESS_LEVEL_READER, useValue: ownerForAnyone }],
    });
    resolver = testApp.app.get(PermissionResolver);
    runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
  });

  afterAll(async () => {
    await testApp?.close();
    await world?.close();
  });

  beforeEach(() => {
    ownerForAnyone.levelFor.mockClear();
  });

  it.each(INTERNAL_ROLES)(
    'CA-9: como %s, `levelFor` y `can` niegan sin consultar el lector',
    async (role) => {
      const actor = createActor(world.internals[role].id, role);
      const nodeId = world.clients[0].id;

      const [level, allowed] = await runner.withActor(actor, async () => [
        await resolver.levelFor(actor, nodeId),
        await Promise.all(CONTENT_ACTIONS.map((action) => resolver.can(actor, nodeId, action))),
      ]);

      expect(level).toBeNull();
      expect(allowed.every((result) => result === false)).toBe(true);
      expect(ownerForAnyone.levelFor).not.toHaveBeenCalled();
    },
  );

  it('CA-9: el mismo lector sí da `OWNER` a un cliente (el corte es por rol, no por el lector)', async () => {
    const [client] = world.clients;
    const actor = createActor(client.id, Role.CLIENT);

    const level = await runner.withActor(actor, () => resolver.levelFor(actor, client.id));

    expect(level).toBe(AccessLevel.OWNER);
    expect(ownerForAnyone.levelFor).toHaveBeenCalledTimes(1);
  });
});
