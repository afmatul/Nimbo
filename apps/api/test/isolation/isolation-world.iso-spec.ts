import request from 'supertest';
import { DataSource } from 'typeorm';

import { createActor, Role } from '../../src/shared';
import { createTestApp } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner, requiredEnv } from '../support/database-urls';

import { aClient, anInternal, createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld } from './setup/isolation-world';

interface StoredAccount {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: string;
  readonly estado: string;
  readonly creado_en: Date;
  readonly terminos_aceptados_en: Date | null;
}

/** Posiciones en las que dos cadenas de igual longitud difieren. */
const differingPositions = (a: string, b: string): number =>
  [...a].filter((char, index) => char !== b[index]).length;

/**
 * El mundo de aislamiento (003 CA-15, D-3, plan §6.7): cuentas insertadas como el dueño de las tablas, tokens de
 * prueba por cuenta y una app que se conecta como `nimbo_app`.
 */
describe('mundo de aislamiento (CA-15)', () => {
  let world: IsolationWorld;
  let owner: DataSource;

  const stored = async (id: string): Promise<StoredAccount | undefined> => {
    const [row] = (await owner.query(
      `SELECT id, nombre, correo, rol, estado, creado_en, terminos_aceptados_en
         FROM usuario WHERE id = $1`,
      [id],
    )) as StoredAccount[];
    return row;
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    world = await createIsolationWorld();
  });

  afterAll(async () => {
    await world.close();
    await owner.destroy();
  });

  it('CA-15: los dos clientes son casi idénticos (mismo nombre, estado y fechas; correos a un carácter)', async () => {
    const [first, second] = await Promise.all(world.clients.map((client) => stored(client.id)));

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    expect(first.id).not.toBe(second.id);
    expect({ ...first, id: undefined, correo: undefined }).toEqual({
      ...second,
      id: undefined,
      correo: undefined,
    });
    expect(first.rol).toBe(Role.CLIENT);
    expect(first.correo).toHaveLength(second.correo.length);
    expect(differingPositions(first.correo, second.correo)).toBe(1);
  });

  it('CA-15: hay una cuenta por rol interno, guardada con su rol', async () => {
    const internals = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const;

    const rows = await Promise.all(internals.map((role) => stored(world.internals[role].id)));

    expect(rows.map((row) => row?.rol)).toEqual([...internals]);
  });

  it('D-3: el builder arma la cuenta con el nombre pedido y el rol del builder', () => {
    const client = aClient().named('Ana López').build();
    const support = anInternal(Role.SUPPORT).build();

    expect(client).toMatchObject({ name: 'Ana López', role: Role.CLIENT });
    expect(support).toMatchObject({ role: Role.SUPPORT });
    expect(client.id).not.toBe(support.id);
  });

  describe('con la app del mundo', () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await world.appAs();
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('CA-15: `appAs` se conecta como `nimbo_app`', async () => {
      const [row] = (await testApp.app.get(DataSource).query('SELECT current_user AS usuario')) as {
        usuario: string;
      }[];

      expect(row?.usuario).toBe('nimbo_app');
    });

    it.each([
      ['el primer cliente', (w: IsolationWorld) => w.clients[0]],
      ['el segundo cliente', (w: IsolationWorld) => w.clients[1]],
      ['el administrador', (w: IsolationWorld) => w.internals[Role.ADMIN]],
      ['el soporte', (w: IsolationWorld) => w.internals[Role.SUPPORT]],
      ['el operador', (w: IsolationWorld) => w.internals[Role.OPERATOR]],
    ])('CA-15: `tokenFor` da un token que `/__probe/actor` acepta como %s', async (_, pick) => {
      const account = pick(world);

      const response = await request(testApp.app.getHttpServer())
        .get('/api/v1/__probe/actor')
        .set('Authorization', `Bearer ${world.tokenFor(account)}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createActor(account.id, account.role));
    });
  });

  it('CA-15: con la URL del dueño la app no arranca, por eso `appAs` nunca la usa', async () => {
    await expect(
      createTestApp({ env: { DATABASE_URL: requiredEnv('DATABASE_MIGRATION_URL') } }),
    ).rejects.toThrow('pnpm db:app-role');
  });
});
