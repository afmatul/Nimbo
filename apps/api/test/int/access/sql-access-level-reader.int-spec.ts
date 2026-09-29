import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { AccessLevel, AccessModule, Action, PermissionResolver } from '../../../src/modules/access';
import type { AccessibleNodesFragment } from '../../../src/modules/access/infrastructure/sql/accessible-nodes';
import {
  readAccessLevel,
  SqlAccessLevelReader,
} from '../../../src/modules/access/infrastructure/sql/sql-access-level-reader';
import {
  buildDataSourceOptions,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
} from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

type Grant = readonly [nodeId: string, level: string];

/** Fragmento con filas fijas (`VALUES`), con la forma de `accessibleNodes`, para probar la precedencia. */
const fragmentWith = (grants: readonly Grant[]): AccessibleNodesFragment => ({
  sql:
    'SELECT nodo_id, tipo_nodo, nivel FROM (VALUES ' +
    grants
      .map(
        (_, index) =>
          `(:access_prueba_nodo_${index}::uuid, 'archivo', :access_prueba_nivel_${index}::text)`,
      )
      .join(', ') +
    ') AS concedidos (nodo_id, tipo_nodo, nivel)',
  parameters: Object.fromEntries(
    grants.flatMap(([nodeId, level], index) => [
      [`access_prueba_nodo_${index}`, nodeId],
      [`access_prueba_nivel_${index}`, level],
    ]),
  ),
});

/**
 * `SqlAccessLevelReader` contra el Postgres del arnés, como `nimbo_app` (plan 003 §6.5, §8). En 003 el fragmento es
 * el conjunto vacío, así que el lector devuelve `null`, pero la consulta se ejecuta de verdad: el contrato de
 * `levelFor` queda probado para 005 y 012.
 */
describe('SqlAccessLevelReader en Postgres (CA-9, CA-10 parcial)', () => {
  let dataSource: DataSource;
  let context: TransactionContext;
  let runner: TypeOrmTransactionRunner;
  let reader: SqlAccessLevelReader;

  beforeAll(async () => {
    dataSource = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
    ).initialize();
    context = new TransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
    reader = new SqlAccessLevelReader(context);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('CA-10: dentro de `withActor` la consulta se ejecuta en la transacción del actor y devuelve `null`', async () => {
    const actor = createActor(randomUUID(), Role.CLIENT);

    await runner.withActor(actor, async () => {
      const query = jest.spyOn(context.requireActorScope(actor), 'query');

      await expect(reader.levelFor(actor, randomUUID())).resolves.toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  it('CA-9: fuera de `withActor` lanza `ActorScopeMissingError` y no consulta', async () => {
    const actor = createActor(randomUUID(), Role.CLIENT);
    const query = jest.spyOn(dataSource.manager, 'query');

    await expect(reader.levelFor(actor, randomUUID())).rejects.toBeInstanceOf(
      ActorScopeMissingError,
    );
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
  });

  describe('precedencia `OWNER > EDITOR > VIEWER` con `LIMIT 1`', () => {
    const node = randomUUID();
    const levelIn = (grants: readonly Grant[]): Promise<AccessLevel | null> =>
      readAccessLevel(dataSource.manager, fragmentWith(grants), node);

    it('CA-10: con varias filas del nodo gana el mayor nivel', async () => {
      await expect(
        levelIn([
          [node, AccessLevel.VIEWER],
          [node, AccessLevel.OWNER],
          [node, AccessLevel.EDITOR],
        ]),
      ).resolves.toBe(AccessLevel.OWNER);
      await expect(
        levelIn([
          [node, AccessLevel.VIEWER],
          [node, AccessLevel.EDITOR],
        ]),
      ).resolves.toBe(AccessLevel.EDITOR);
    });

    it('CA-10: las filas de otros nodos no cuentan', async () => {
      await expect(levelIn([[randomUUID(), AccessLevel.OWNER]])).resolves.toBeNull();
      await expect(
        levelIn([
          [randomUUID(), AccessLevel.OWNER],
          [node, AccessLevel.VIEWER],
        ]),
      ).resolves.toBe(AccessLevel.VIEWER);
    });

    it('CA-9: un nivel que no es de `AccessLevel` no da acceso (cerrado por defecto)', async () => {
      await expect(levelIn([[node, 'ADMIN']])).resolves.toBeNull();
    });
  });
});

/** `AccessModule` compuesto como en `AppModule`: `PermissionResolver` con el lector SQL real (plan 003 §6.5, §6.6). */
describe('PermissionResolver desde AccessModule (CA-8, CA-9)', () => {
  let testApp: TestApp;
  let resolver: PermissionResolver;
  let runner: ITransactionRunner;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [AccessModule] });
    resolver = testApp.app.get(PermissionResolver);
    runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-9: para un cliente dentro de `withActor` consulta Postgres y, sin nodos en 003, niega', async () => {
    const actor = createActor(randomUUID(), Role.CLIENT);
    const node = randomUUID();

    await runner.withActor(actor, async () => {
      await expect(resolver.levelFor(actor, node)).resolves.toBeNull();
      await expect(resolver.can(actor, node, Action.VIEW)).resolves.toBe(false);
    });
  });

  it('CA-9: para un cliente fuera de `withActor` el lector lanza `ActorScopeMissingError`', async () => {
    const actor = createActor(randomUUID(), Role.CLIENT);

    await expect(resolver.can(actor, randomUUID(), Action.VIEW)).rejects.toBeInstanceOf(
      ActorScopeMissingError,
    );
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-9: el rol interno %s recibe `false` sin llegar al lector (ni siquiera sin `withActor`)',
    async (role) => {
      await expect(
        resolver.can(createActor(randomUUID(), role), randomUUID(), Action.VIEW),
      ).resolves.toBe(false);
    },
  );
});
