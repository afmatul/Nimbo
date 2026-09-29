import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { CrearDispositivo20260929100000 } from '../../../src/migrations/20260929100000-crear-dispositivo';
import { buildDataSourceOptions } from '../../../src/shared';

import { CREATED_AT, aClient, insertUser, violatedConstraint } from './identity-rows';

const FINGERPRINT_A = 'a'.repeat(64);
const FINGERPRINT_B = 'b'.repeat(64);

interface DeviceRow {
  usuario_id: string;
  huella_hash: string;
  ultima_ip: string | null;
  ultimo_acceso: string;
}

const aDevice = (usuarioId: string, patch: Partial<DeviceRow> = {}): DeviceRow => ({
  usuario_id: usuarioId,
  huella_hash: FINGERPRINT_A,
  ultima_ip: '203.0.113.7',
  ultimo_acceso: CREATED_AT,
  ...patch,
});

const insertDevice = async (runner: QueryRunner, row: DeviceRow): Promise<string> => {
  const rows = (await runner.query(
    `INSERT INTO dispositivo (usuario_id, huella_hash, ultima_ip, ultimo_acceso)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [row.usuario_id, row.huella_hash, row.ultima_ip, row.ultimo_acceso],
  )) as { id: string }[];
  return rows[0]?.id ?? '';
};

const aUserIn = async (runner: QueryRunner): Promise<string> => {
  const user = aClient();
  await insertUser(runner, user);
  return user.id;
};

/** Columnas, restricciones e índices de una tabla, para comparar el esquema antes y después de revertir. */
const shapeOf = async (runner: QueryRunner, table: string): Promise<unknown> => ({
  columns: await runner.query(
    `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name`,
    [table],
  ),
  constraints: await runner.query(
    `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE conrelid = to_regclass($1) ORDER BY conname`,
    [table],
  ),
  indexes: await runner.query(
    'SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ORDER BY indexname',
    [table],
  ),
});

const tableExists = async (runner: QueryRunner, table: string): Promise<boolean> => {
  const rows = (await runner.query('SELECT to_regclass($1) IS NOT NULL AS present', [table])) as {
    present: boolean;
  }[];
  return rows[0]?.present ?? false;
};

/** Migraciones `dispositivo` y `sesion` de la spec 002 (plan §4) sobre la BD migrada por el arnés. */
describe('migraciones de dispositivo y sesión (CA-16, CA-17, CA-24)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  beforeAll(async () => {
    dataSource = new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
    );
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.startTransaction();
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  describe('dispositivo', () => {
    it.each([
      ['en mayúsculas', 'A'.repeat(64)],
      ['de 63 caracteres', 'a'.repeat(63)],
      ['con caracteres no hex', 'g'.repeat(64)],
    ])('CA-17: rechaza una `huella_hash` %s', async (_label, huella_hash) => {
      const userId = await aUserIn(runner);

      await expect(
        violatedConstraint(insertDevice(runner, aDevice(userId, { huella_hash }))),
      ).resolves.toBe('ck_dispositivo_huella_hash');
    });

    it('CA-16: rechaza la misma huella dos veces en la misma cuenta', async () => {
      const userId = await aUserIn(runner);
      await insertDevice(runner, aDevice(userId));

      await expect(violatedConstraint(insertDevice(runner, aDevice(userId)))).resolves.toBe(
        'uq_dispositivo_usuario_id_huella_hash',
      );
    });

    it('CA-16: la misma huella en dos cuentas son dos dispositivos', async () => {
      const [first, second] = [await aUserIn(runner), await aUserIn(runner)];
      await insertDevice(runner, aDevice(first));

      await expect(
        violatedConstraint(insertDevice(runner, aDevice(second))),
      ).resolves.toBeUndefined();
    });

    it("CA-17: `agente_usuario` es `''` por defecto y `ultima_ip` es `inet`", async () => {
      const userId = await aUserIn(runner);
      const id = await insertDevice(runner, aDevice(userId, { huella_hash: FINGERPRINT_B }));

      const rows = (await runner.query(
        `SELECT agente_usuario, host(ultima_ip) AS ip, pg_typeof(ultima_ip)::text AS ip_type
           FROM dispositivo WHERE id = $1`,
        [id],
      )) as { agente_usuario: string; ip: string; ip_type: string }[];
      expect(rows[0]).toEqual({ agente_usuario: '', ip: '203.0.113.7', ip_type: 'inet' });
      await expect(
        runner.query(
          'INSERT INTO dispositivo (usuario_id, huella_hash, ultima_ip, ultimo_acceso) VALUES ($1, $2, $3, $4)',
          [userId, FINGERPRINT_A, 'no-es-una-ip', CREATED_AT],
        ),
      ).rejects.toThrow(/inet/);
    });

    it('CA-24: borrar el usuario borra sus dispositivos en cascada', async () => {
      const userId = await aUserIn(runner);
      await insertDevice(runner, aDevice(userId));

      await runner.query('DELETE FROM usuario WHERE id = $1', [userId]);

      const rows = (await runner.query('SELECT 1 FROM dispositivo WHERE usuario_id = $1', [
        userId,
      ])) as unknown[];
      expect(rows).toHaveLength(0);
    });
  });

  it('CA-24: run → revert → run deja `dispositivo` igual', async () => {
    const migration = new CrearDispositivo20260929100000();
    const before = await shapeOf(runner, 'dispositivo');

    await migration.down(runner);
    expect(await tableExists(runner, 'dispositivo')).toBe(false);
    await migration.up(runner);

    expect(await shapeOf(runner, 'dispositivo')).toEqual(before);
  });
});
