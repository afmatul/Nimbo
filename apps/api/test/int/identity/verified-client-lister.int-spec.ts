import type { DataSource } from 'typeorm';

import { VerifiedClientLister } from '../../../src/modules/identity';
import { TypeOrmAccountDirectoryRepository } from '../../../src/modules/identity/infrastructure/persistence/typeorm-account-directory.repository';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

/** Más que las cuentas de cualquier suite: una página trae todas las de la base compartida. */
const ALL = 100_000;

/** Ids de clientes verificados como `nimbo_app`, sin actor (009 CA-2): lo que ve la conciliación de `billing`. */
describe('VerifiedClientLister (spec 009 CA-2)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let lister: VerifiedClientLister;
  const created: string[] = [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    lister = new VerifiedClientLister(new TypeOrmAccountDirectoryRepository(app.context));
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  const account = async (role: Role, verified = true): Promise<string> => {
    const id = await insertAccount(owner, role);
    created.push(id);
    if (!verified)
      await owner.query('UPDATE usuario SET correo_verificado = false WHERE id = $1', [id]);
    return id;
  };

  const listAll = (afterId: string | null = null, limit = ALL): Promise<readonly string[]> =>
    app.runner.run(() => lister.listIds(afterId, limit));

  it('CA-2: lista solo clientes con el correo verificado (sin internos ni cuentas sin verificar)', async () => {
    const verified = await account(Role.CLIENT);
    const unverified = await account(Role.CLIENT, false);
    const admin = await account(Role.ADMIN);

    const ids = await listAll();

    expect(ids).toContain(verified);
    expect(ids).not.toContain(unverified);
    expect(ids).not.toContain(admin);
  });

  it('CA-2: pagina por `id` ascendente después de `afterId`, con `limit` filas', async () => {
    const [first, second] = [await account(Role.CLIENT), await account(Role.CLIENT)].sort();
    const ids = await listAll();
    const before = ids[ids.indexOf(first as string) - 1] ?? null;

    const page = await listAll(before, 1);

    expect([...ids]).toEqual([...ids].sort());
    expect(page).toEqual([first]);
    expect(await listAll(first as string, ALL)).toContain(second);
  });
});
