import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { ShareeDirectoryAdapter, UserDirectoryAdapter } from '../../../src/modules/identity';
import type { Sharee } from '../../../src/modules/sharing';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

/**
 * `IShareeDirectory` de `sharing` implementado por `identity` (012 CA-3, RN-3, RN-8, DF-84): solo un cliente
 * verificado y activo es destinatario; los demás motivos dan `null`, sin distinguirse.
 */
describe('ShareeDirectoryAdapter (spec 012 CA-3, CA-8, CA-22)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let directory: ShareeDirectoryAdapter;
  const created: string[] = [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    directory = new ShareeDirectoryAdapter(app.context, new UserDirectoryAdapter(app.context));
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  const account = async (role: Role, change?: string): Promise<string> => {
    const id = await insertAccount(owner, role);
    created.push(id);
    if (change !== undefined) await owner.query(`UPDATE usuario SET ${change} WHERE id = $1`, [id]);
    return id;
  };

  const emailOf = (id: string): string => `storage.${id}@ejemplo.com`;

  const find = (email: string): Promise<Sharee | null> =>
    app.runner.run(() => directory.findClientByEmail(email));

  it('CA-3: encuentra al cliente verificado y activo, con el correo sin normalizar', async () => {
    const id = await account(Role.CLIENT, "nombre = 'Bea Ruiz'");

    const sharee = await find(`  ${emailOf(id).toUpperCase()} `);

    expect(sharee).toEqual({ id, displayName: 'Bea Ruiz', email: emailOf(id) });
  });

  it.each([
    ['una cuenta interna', Role.ADMIN, undefined],
    ['un cliente sin verificar', Role.CLIENT, 'correo_verificado = false'],
    ['un cliente suspendido', Role.CLIENT, "estado = 'suspendida'"],
  ])('CA-3, RN-8: %s no es destinatario (null)', async (_, role, change) => {
    const id = await account(role, change);

    expect(await find(emailOf(id))).toBeNull();
  });

  it('CA-3: un correo sin cuenta da null', async () => {
    expect(await find(emailOf(randomUUID()))).toBeNull();
  });

  it('CA-8: da nombre y correo de las cuentas pedidas que existen, también de una suspendida', async () => {
    const id = await account(Role.CLIENT, "nombre = 'Dora Gil', estado = 'suspendida'");

    const profiles = await app.runner.run(() => directory.profiles([id, randomUUID()]));

    expect([...profiles.entries()]).toEqual([
      [id, { id, displayName: 'Dora Gil', email: emailOf(id) }],
    ]);
  });

  it('CA-22: da el nombre visible de las cuentas pedidas que existen', async () => {
    const id = await account(Role.CLIENT, "nombre = 'Ciro Paz'");

    const names = await app.runner.run(() => directory.displayNames([id, randomUUID()]));

    expect([...names.entries()]).toEqual([[id, 'Ciro Paz']]);
  });
});
