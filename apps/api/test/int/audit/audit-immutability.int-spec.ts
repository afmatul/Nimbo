import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

/**
 * Solo adición en la base (spec 004 CA-6, D-7; plan §3): conectada como `nimbo_app`, la aplicación inserta y lee
 * `evento_auditoria`, pero `UPDATE`, `DELETE` y `TRUNCATE` dan `permission denied` aunque el actor sea el afectado.
 */
describe('inmutabilidad de `evento_auditoria` como `nimbo_app` (CA-6)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let ana: Actor;
  const created: string[] = [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    const anaId = await owner.transaction((manager) => insertAccount(manager));
    created.push(anaId);
    ana = createActor(anaId, Role.CLIENT);
    await app.asActor(ana, (manager) =>
      manager.query(
        `INSERT INTO evento_auditoria (id, accion, actor_id, rol_actor, usuario_afectado_id, ocurrido_en)
         VALUES ($1, 'trash.emptied', $2, 'CLIENT', $2, now())`,
        [randomUUID(), ana.id],
      ),
    );
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it.each([
    ['UPDATE', "UPDATE evento_auditoria SET accion = 'node.restored'"],
    ['DELETE', 'DELETE FROM evento_auditoria'],
    ['TRUNCATE', 'TRUNCATE evento_auditoria'],
  ])(
    'CA-6: `%s` da `permission denied` aunque el actor sea el afectado',
    async (_verb, statement) => {
      await expect(app.asActor(ana, (manager) => manager.query(statement))).rejects.toThrow(
        /permission denied for table evento_auditoria/,
      );
    },
  );

  it('CA-6: el evento sigue intacto y legible por su afectado', async () => {
    const rows = (await app.asActor(ana, (manager) =>
      manager.query('SELECT accion FROM evento_auditoria WHERE usuario_afectado_id = $1', [ana.id]),
    )) as { accion: string }[];

    expect(rows).toEqual([{ accion: 'trash.emptied' }]);
  });

  it.each([
    ['SELECT', true],
    ['INSERT', true],
    ['UPDATE', false],
    ['DELETE', false],
    ['TRUNCATE', false],
  ])('CA-6: `nimbo_app` tiene %s = %s sobre `evento_auditoria`', async (privilege, granted) => {
    const [row] = (await owner.query(
      "SELECT has_table_privilege('nimbo_app', 'evento_auditoria', $1) AS ok",
      [privilege],
    )) as { ok: boolean }[];

    expect(row?.ok).toBe(granted);
  });
});
