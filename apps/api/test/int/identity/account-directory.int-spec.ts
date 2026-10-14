import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { AccountStatus } from '../../../src/modules/identity/domain/account-status.enum';
import { EmailAddress } from '../../../src/modules/identity/domain/email-address.vo';
import { TypeOrmAccountDirectoryRepository } from '../../../src/modules/identity/infrastructure/persistence/typeorm-account-directory.repository';
import { Role } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { connectAsOwner, connectTo, requiredEnv } from '../../support/database-urls';
import { employeeCodeFor } from '../../support/employee-codes';

const PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$ZGlyZWN0b3Jpbw';
const PAGE_SIZE = 2;
const HOUR_MS = 3_600_000;
const BASE_AT = new Date('2026-10-07T08:00:00.000Z');

interface SeedOptions {
  readonly role?: Role;
  readonly status?: AccountStatus;
  readonly usedBytes?: bigint;
  readonly hour: number;
}

/**
 * Modelo de lectura de cuentas del backoffice (011 CA-1, CA-12, CA-13; plan §2) sobre Postgres real como `nimbo_app`.
 * Las cuentas se siembran como el dueño con un prefijo de correo propio de la corrida, así la base compartida del
 * arnés no altera los resultados; las estadísticas se comparan por diferencia.
 */
describe('TypeOrmAccountDirectoryRepository (011 CA-1, CA-12, CA-13)', () => {
  const prefix = `dir-${randomUUID().slice(0, 8)}-`;
  let owner: DataSource;
  let app: DataSource;
  let directory: TypeOrmAccountDirectoryRepository;
  const created: string[] = [];

  const seed = async (local: string, options: SeedOptions): Promise<string> => {
    const id = randomUUID();
    const role = options.role ?? Role.CLIENT;
    const isClient = role === Role.CLIENT;
    await owner.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, estado, correo_verificado, version_terminos,
         version_privacidad, terminos_aceptados_en, codigo_empleado, espacio_usado, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7, $8, $9, $10, $11)`,
      [
        id,
        `Cuenta ${local}`,
        `${prefix}${local}@nimbo.me`,
        PHC,
        role,
        options.status ?? AccountStatus.ACTIVE,
        isClient ? '1.0' : null,
        isClient ? BASE_AT : null,
        employeeCodeFor(role),
        String(options.usedBytes ?? 0n),
        new Date(BASE_AT.getTime() + options.hour * HOUR_MS),
      ],
    );
    created.push(id);
    return id;
  };

  let ids: Record<'ana' | 'beto' | 'soporte', string>;

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectTo(requiredEnv('DATABASE_URL'));
    directory = new TypeOrmAccountDirectoryRepository(new TransactionContext(app));
    ids = {
      ana: await seed('ana', { hour: 1, usedBytes: 3_221_225_472n }),
      beto: await seed('beto', { hour: 2, status: AccountStatus.SUSPENDED }),
      soporte: await seed('soporte', { hour: 3, role: Role.SUPPORT, usedBytes: 99n }),
    };
  });

  afterAll(async () => {
    await app.destroy();
    await owner.query('DELETE FROM usuario WHERE id = ANY($1)', [created]);
    await owner.destroy();
  });

  it('CA-1: lista por inicio del correo, de la más nueva a la más vieja, paginada y con el total', async () => {
    const first = await directory.list({ emailPrefix: prefix, page: 1, pageSize: PAGE_SIZE });
    const second = await directory.list({ emailPrefix: prefix, page: 2, pageSize: PAGE_SIZE });

    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.id)).toEqual([ids.soporte, ids.beto]);
    expect(second.items.map((item) => item.id)).toEqual([ids.ana]);
    expect(second.total).toBe(3);
  });

  it('CA-1: una página más allá del final viene vacía pero conserva el total', async () => {
    const page = await directory.list({ emailPrefix: prefix, page: 9, pageSize: PAGE_SIZE });

    expect(page).toEqual({ items: [], total: 3 });
  });

  it('CA-1: cada cuenta trae sus datos; el espacio usado es `null` en las internas', async () => {
    const page = await directory.list({ emailPrefix: prefix, page: 1, pageSize: 10 });
    const byId = new Map(page.items.map((item) => [item.id, item]));

    expect(byId.get(ids.ana)).toEqual({
      id: ids.ana,
      email: `${prefix}ana@nimbo.me`,
      fullName: 'Cuenta ana',
      role: Role.CLIENT,
      status: AccountStatus.ACTIVE,
      emailVerified: true,
      usedBytes: 3_221_225_472n,
      createdAt: new Date(BASE_AT.getTime() + HOUR_MS),
    });
    expect(byId.get(ids.beto)?.status).toBe(AccountStatus.SUSPENDED);
    expect(byId.get(ids.soporte)).toMatchObject({ role: Role.SUPPORT, usedBytes: null });
  });

  it('CA-2: `findById` devuelve la ficha, o `null` si no existe', async () => {
    await expect(directory.findById(ids.beto)).resolves.toMatchObject({
      id: ids.beto,
      status: AccountStatus.SUSPENDED,
    });
    await expect(directory.findById(randomUUID())).resolves.toBeNull();
  });

  it('CA-13: `findClientByEmail` solo encuentra clientes; interna o inexistente dan `null`', async () => {
    const client = await directory.findClientByEmail(EmailAddress.of(`${prefix}ana@nimbo.me`));
    const internal = await directory.findClientByEmail(
      EmailAddress.of(`${prefix}soporte@nimbo.me`),
    );
    const missing = await directory.findClientByEmail(EmailAddress.of(`${prefix}nadie@nimbo.me`));

    expect(client).toEqual({
      id: ids.ana,
      fullName: 'Cuenta ana',
      email: `${prefix}ana@nimbo.me`,
    });
    expect(internal).toBeNull();
    expect(missing).toBeNull();
  });

  it('CA-12: las estadísticas cuentan por tipo y estado y suman `espacio_usado`', async () => {
    const before = await directory.statistics();
    await seed('extra', { hour: 4, status: AccountStatus.SUSPENDED, usedBytes: 10n });
    await seed('operacion', { hour: 5, role: Role.OPERATOR, usedBytes: 7n });

    const after = await directory.statistics();

    expect(after).toEqual({
      total: before.total + 2,
      clients: before.clients + 1,
      internal: before.internal + 1,
      active: before.active + 1,
      suspended: before.suspended + 1,
      usedBytesTotal: before.usedBytesTotal + 17n,
    });
  });
  it('CA-1: `%` y `_` del prefijo se buscan literalmente, no como comodines', async () => {
    const literal = await seed('x_y', { hour: 6 });
    await seed('xzy', { hour: 7 });

    const underscore = await directory.list({ emailPrefix: `${prefix}x_`, page: 1, pageSize: 10 });
    const percent = await directory.list({ emailPrefix: `${prefix}%`, page: 1, pageSize: 10 });

    expect(underscore.items.map((item) => item.id)).toEqual([literal]);
    expect(percent.total).toBe(0);
  });
});
