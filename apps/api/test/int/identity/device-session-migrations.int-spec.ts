import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { CrearDispositivo20260929100000 } from '../../../src/migrations/20260929100000-crear-dispositivo';
import { CrearSesion20260929100100 } from '../../../src/migrations/20260929100100-crear-sesion';
import { buildDataSourceOptions } from '../../../src/shared';

import { CREATED_AT, aClient, insertUser, violatedConstraint } from './identity-rows';

const FINGERPRINT_A = 'a'.repeat(64);
const FINGERPRINT_B = 'b'.repeat(64);
const REFRESH_A = 'c'.repeat(64);
const REFRESH_B = 'd'.repeat(64);
const LAST_USED_AT = '2026-09-29T10:00:00Z';
const APP_ROLE = 'nimbo_app';
const EXPIRES_AT = '2026-10-28T10:00:00Z';

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

interface SessionRow {
  usuario_id: string;
  dispositivo_id: string;
  refresh_hash: string;
  refresh_anterior_hash: string | null;
  rotado_en: string | null;
  creada_en: string;
  ultimo_uso: string;
  expira_en: string;
}

const aSession = (
  usuarioId: string,
  dispositivoId: string,
  patch: Partial<SessionRow> = {},
): SessionRow => ({
  usuario_id: usuarioId,
  dispositivo_id: dispositivoId,
  refresh_hash: REFRESH_A,
  refresh_anterior_hash: null,
  rotado_en: null,
  creada_en: CREATED_AT,
  ultimo_uso: LAST_USED_AT,
  expira_en: EXPIRES_AT,
  ...patch,
});

const insertSession = (runner: QueryRunner, row: SessionRow): Promise<unknown> =>
  runner.query(
    `INSERT INTO sesion (usuario_id, dispositivo_id, refresh_hash, refresh_anterior_hash, rotado_en, creada_en,
       ultimo_uso, expira_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.usuario_id,
      row.dispositivo_id,
      row.refresh_hash,
      row.refresh_anterior_hash,
      row.rotado_en,
      row.creada_en,
      row.ultimo_uso,
      row.expira_en,
    ],
  );

const aUserIn = async (runner: QueryRunner): Promise<string> => {
  const user = aClient();
  await insertUser(runner, user);
  return user.id;
};

interface TablePrivileges {
  SELECT: boolean;
  INSERT: boolean;
  UPDATE: boolean;
  DELETE: boolean;
}

/** Permisos de `nimbo_app` sobre una tabla (plan 003 §4 (b)). */
const appPrivilegesOn = async (runner: QueryRunner, table: string): Promise<TablePrivileges> => {
  const rows = (await runner.query(
    `SELECT has_table_privilege($1, $2, 'SELECT') AS "SELECT",
            has_table_privilege($1, $2, 'INSERT') AS "INSERT",
            has_table_privilege($1, $2, 'UPDATE') AS "UPDATE",
            has_table_privilege($1, $2, 'DELETE') AS "DELETE"`,
    [APP_ROLE, table],
  )) as TablePrivileges[];
  return rows[0] as TablePrivileges;
};

/**
 * Columnas, restricciones, índices y permisos de `nimbo_app` de una tabla, para comparar el esquema antes y después de
 * revertir.
 */
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
  appPrivileges: await appPrivilegesOn(runner, table),
});

/** Un usuario con un dispositivo, listos para colgarles sesiones. */
const anOwnedDevice = async (
  runner: QueryRunner,
): Promise<{ userId: string; deviceId: string }> => {
  const userId = await aUserIn(runner);
  const deviceId = await insertDevice(runner, aDevice(userId));
  return { userId, deviceId };
};

const tableExists = async (runner: QueryRunner, table: string): Promise<boolean> => {
  const rows = (await runner.query('SELECT to_regclass($1) IS NOT NULL AS present', [table])) as {
    present: boolean;
  }[];
  return rows[0]?.present ?? false;
};

/**
 * Migraciones `dispositivo` y `sesion` de la spec 002 (plan §4) sobre la BD migrada por el arnés. Prueba el esquema,
 * no los permisos de la app: se conecta como el dueño (`DATABASE_MIGRATION_URL`), que puede borrar un `usuario` para
 * comprobar la cascada y revertir las migraciones (`nimbo_app` no tiene `DELETE` en `usuario` ni `CREATE` en `public`,
 * plan 003 §4 (b)).
 */
describe('migraciones de dispositivo y sesión (CA-16, CA-17, CA-24)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  beforeAll(async () => {
    dataSource = new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_MIGRATION_URL'] ?? '' }),
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

  describe('sesion', () => {
    it('CA-1: acepta una sesión recién iniciada', async () => {
      const { userId, deviceId } = await anOwnedDevice(runner);

      await expect(
        violatedConstraint(insertSession(runner, aSession(userId, deviceId))),
      ).resolves.toBeUndefined();
    });

    it('CA-24: rechaza una sesión cuyo usuario no es el dueño del dispositivo', async () => {
      const { deviceId } = await anOwnedDevice(runner);
      const stranger = await aUserIn(runner);

      await expect(
        violatedConstraint(insertSession(runner, aSession(stranger, deviceId))),
      ).resolves.toBe('fk_sesion_dispositivo_usuario');
    });

    it.each([
      ['`refresh_anterior_hash` sin `rotado_en`', { refresh_anterior_hash: REFRESH_B }],
      ['`rotado_en` sin `refresh_anterior_hash`', { rotado_en: LAST_USED_AT }],
    ])('CA-7: rechaza %s', async (_label, patch) => {
      const { userId, deviceId } = await anOwnedDevice(runner);

      await expect(
        violatedConstraint(insertSession(runner, aSession(userId, deviceId, patch))),
      ).resolves.toBe('ck_sesion_rotacion');
    });

    it('CA-7: acepta una sesión rotada con el secreto anterior y la fecha de rotación', async () => {
      const { userId, deviceId } = await anOwnedDevice(runner);
      const rotated = { refresh_anterior_hash: REFRESH_B, rotado_en: LAST_USED_AT };

      await expect(
        violatedConstraint(insertSession(runner, aSession(userId, deviceId, rotated))),
      ).resolves.toBeUndefined();
    });

    it.each([
      ['`expira_en <= creada_en`', { expira_en: CREATED_AT }],
      ['`ultimo_uso < creada_en`', { ultimo_uso: '2026-09-27T10:00:00Z' }],
    ])('CA-8: rechaza %s', async (_label, patch) => {
      const { userId, deviceId } = await anOwnedDevice(runner);

      await expect(
        violatedConstraint(insertSession(runner, aSession(userId, deviceId, patch))),
      ).resolves.toBe('ck_sesion_vigencia');
    });

    it.each([
      ['refresh_hash', { refresh_hash: 'A'.repeat(64) }, 'ck_sesion_refresh_hash'],
      [
        'refresh_anterior_hash',
        { refresh_anterior_hash: 'x'.repeat(64), rotado_en: LAST_USED_AT },
        'ck_sesion_refresh_anterior_hash',
      ],
    ])('CA-24: rechaza un `%s` que no es hex de 64', async (_label, patch, constraint) => {
      const { userId, deviceId } = await anOwnedDevice(runner);

      await expect(
        violatedConstraint(insertSession(runner, aSession(userId, deviceId, patch))),
      ).resolves.toBe(constraint);
    });

    it('CA-1: existen el índice parcial por dueño y el de la FK compuesta', async () => {
      const rows = (await runner.query(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE tablename = 'sesion' AND indexname LIKE 'idx_%' ORDER BY indexname`,
      )) as { indexname: string; indexdef: string }[];

      expect(rows.map((row) => row.indexname)).toEqual([
        'idx_sesion_dispositivo_id_usuario_id',
        'idx_sesion_usuario_id_ultimo_uso',
      ]);
      expect(rows[1]?.indexdef).toMatch(
        /\(usuario_id, ultimo_uso DESC\) WHERE \(revocada_en IS NULL\)/,
      );
    });

    it('una sola sesión sin revocar por dispositivo (`uq_sesion_dispositivo_id`)', async () => {
      const { userId, deviceId } = await anOwnedDevice(runner);
      await insertSession(runner, aSession(userId, deviceId));

      await expect(
        violatedConstraint(insertSession(runner, aSession(userId, deviceId))),
      ).resolves.toBe('uq_sesion_dispositivo_id');
    });

    it('CA-24: borrar el dispositivo borra sus sesiones en cascada', async () => {
      const { userId, deviceId } = await anOwnedDevice(runner);
      await insertSession(runner, aSession(userId, deviceId));

      await runner.query('DELETE FROM dispositivo WHERE id = $1', [deviceId]);

      const rows = (await runner.query('SELECT 1 FROM sesion WHERE usuario_id = $1', [
        userId,
      ])) as unknown[];
      expect(rows).toHaveLength(0);
    });

    it.each(['dispositivo', 'sesion'])(
      'CA-24: `nimbo_app` tiene SELECT, INSERT, UPDATE y DELETE en `%s`',
      async (table) => {
        await expect(appPrivilegesOn(runner, table)).resolves.toEqual({
          SELECT: true,
          INSERT: true,
          UPDATE: true,
          DELETE: true,
        });
      },
    );
  });

  it('CA-24: run → revert (LIFO) → run deja `dispositivo` y `sesion` igual', async () => {
    const [device, session] = [
      new CrearDispositivo20260929100000(),
      new CrearSesion20260929100100(),
    ];
    const before = [await shapeOf(runner, 'dispositivo'), await shapeOf(runner, 'sesion')];

    await session.down(runner);
    expect(await tableExists(runner, 'sesion')).toBe(false);
    await device.down(runner);
    expect(await tableExists(runner, 'dispositivo')).toBe(false);
    await device.up(runner);
    await session.up(runner);

    expect([await shapeOf(runner, 'dispositivo'), await shapeOf(runner, 'sesion')]).toEqual(before);
  });
});
