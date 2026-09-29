import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { AccessLevel } from '../../../src/modules/access/domain/access-level.enum';
import type { AccessibleNodesFragment } from '../../../src/modules/access/infrastructure/sql/accessible-nodes';
import {
  readAccessLevel,
  SqlAccessLevelReader,
} from '../../../src/modules/access/infrastructure/sql/sql-access-level-reader';
import { buildDataSourceOptions, createActor, Role } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';

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
