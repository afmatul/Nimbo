import {
  accessibleNodes,
  AccessModule,
  Action,
  PermissionResolver,
} from '../../src/modules/access';
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
 * así que sin el filtro la consulta sí devolvería filas.
 */
describe('roles internos sin contenido, contra la base (CA-9)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;
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
    await testApp.close();
    await world.close();
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
