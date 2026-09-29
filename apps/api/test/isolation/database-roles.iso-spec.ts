import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../src/shared';

const APP_ROLE = 'nimbo_app';

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined) throw new Error(`El arnés no definió ${key}`);
  return value;
};

const connect = async (url: string): Promise<DataSource> =>
  new DataSource(buildDataSourceOptions({ DATABASE_URL: url })).initialize();

/**
 * Roles de base de datos del arnés compartido (003 CA-13, CA-15; plan §4, §6.8): se migra como el dueño de las
 * tablas y la app se conecta como `nimbo_app`. Si una prueba se conectara como superusuario, pasaría aunque hubiera
 * fugas (ADR-0005).
 */
describe('roles de base de datos (CA-13)', () => {
  let owner: DataSource;

  beforeAll(async () => {
    owner = await connect(requiredEnv('DATABASE_MIGRATION_URL'));
  });

  afterAll(async () => {
    await owner.destroy();
  });

  it('CA-13: el arnés migra con `DATABASE_MIGRATION_URL`, que es el dueño de las tablas', async () => {
    const [row] = (await owner.query(
      `SELECT current_user AS usuario, pg_get_userbyid(c.relowner) AS dueno
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'migracion'`,
    )) as { usuario: string; dueno: string }[];

    expect(row).toBeDefined();
    expect(row?.dueno).toBe(row?.usuario);
  });

  it('CA-13: el rol `nimbo_app` existe en el contenedor compartido y puede iniciar sesión', async () => {
    const rows = (await owner.query('SELECT rolcanlogin FROM pg_roles WHERE rolname = $1', [
      APP_ROLE,
    ])) as { rolcanlogin: boolean }[];

    expect(rows).toEqual([{ rolcanlogin: true }]);
  });
});
