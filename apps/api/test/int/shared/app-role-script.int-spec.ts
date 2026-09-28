import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { ExecResult } from 'testcontainers';

import { POSTGRES_IMAGE } from '../setup/containers';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const SCRIPT_SOURCE = resolve(REPO_ROOT, 'infra/postgres/init/10-nimbo-app.sh');
const SCRIPT_TARGET = '/docker-entrypoint-initdb.d/10-nimbo-app.sh';
const APP_ROLE = 'nimbo_app';
const APP_PASSWORD = 'nimbo_app';
const QUOTED_PASSWORD = "nimbo'app";

interface RoleAttributes {
  readonly rolcanlogin: boolean;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolreplication: boolean;
}

/**
 * Contenedor propio (no el de `globalSetup`): el script altera roles del *cluster*. El script se copia
 * después de arrancar para que el entrypoint no lo ejecute al inicializar sin `NIMBO_APP_DB_PASSWORD`.
 */
describe('script de rol nimbo_app (CA-13)', () => {
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    await postgres.copyFilesToContainer([{ source: SCRIPT_SOURCE, target: SCRIPT_TARGET }]);
  });

  afterAll(async () => {
    await postgres.stop();
  });

  const runScript = (env: Record<string, string>): Promise<ExecResult> =>
    postgres.exec(['sh', SCRIPT_TARGET], { env });

  const ownerQuery = async (sql: string): Promise<string> => {
    const result = await postgres.exec([
      'psql',
      '-U',
      postgres.getUsername(),
      '-d',
      postgres.getDatabase(),
      '-tAc',
      sql,
    ]);
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  };

  /**
   * En la imagen oficial, el socket y 127.0.0.1 son `trust`; solo `host all all all` exige contraseña.
   * Por eso se conecta a la IP del contenedor en su red, no a la interfaz de bucle.
   */
  const connectAsApp = (password: string): Promise<ExecResult> =>
    postgres.exec(
      [
        'sh',
        '-c',
        'psql -h "$(hostname -i)" -U "$APP_ROLE" -d "$POSTGRES_DB" -tAc "SELECT current_user"',
      ],
      { env: { APP_ROLE, PGPASSWORD: password } },
    );

  it('CA-13: es idempotente (dos corridas salen 0) y nimbo_app queda con LOGIN y sin privilegios elevados', async () => {
    const first = await runScript({ NIMBO_APP_DB_PASSWORD: APP_PASSWORD });
    const second = await runScript({ NIMBO_APP_DB_PASSWORD: APP_PASSWORD });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    const row = await ownerQuery(
      `SELECT row_to_json(r) FROM (SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = '${APP_ROLE}') r`,
    );
    expect(JSON.parse(row) as RoleAttributes).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
    });
  });

  it('CA-13: nimbo_app se conecta por TCP con la contraseña dada y no con otra', async () => {
    await runScript({ NIMBO_APP_DB_PASSWORD: APP_PASSWORD });

    const ok = await connectAsApp(APP_PASSWORD);
    const wrong = await connectAsApp('otra-contrasena');

    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.trim()).toBe(APP_ROLE);
    expect(wrong.exitCode).not.toBe(0);
  });

  it('CA-13: sin NIMBO_APP_DB_PASSWORD el script falla con «falta NIMBO_APP_DB_PASSWORD»', async () => {
    const result = await runScript({});

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('falta NIMBO_APP_DB_PASSWORD');
  });

  it('CA-13: una contraseña con comilla simple funciona (la cita psql, no se concatena SQL)', async () => {
    const result = await runScript({ NIMBO_APP_DB_PASSWORD: QUOTED_PASSWORD });

    expect(result.exitCode).toBe(0);
    const connection = await connectAsApp(QUOTED_PASSWORD);
    expect(connection.exitCode).toBe(0);
    expect(connection.stdout.trim()).toBe(APP_ROLE);
  });
});
