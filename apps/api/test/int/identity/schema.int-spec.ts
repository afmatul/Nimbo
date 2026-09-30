import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { buildDataSourceOptions } from '../../../src/shared';

import { CREATED_AT, aClient, insertUser, violatedConstraint } from './identity-rows';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const EXPIRES_AT = '2026-09-29T10:00:00Z';

interface TokenRow {
  usuario_id: string;
  tipo: string;
  token_hash: string;
  expira_en: string;
  creado_en: string;
  usado_en: string | null;
  invalidado_en: string | null;
}

const aToken = (usuarioId: string, patch: Partial<TokenRow> = {}): TokenRow => ({
  usuario_id: usuarioId,
  tipo: 'verificacion',
  token_hash: HASH_A,
  expira_en: EXPIRES_AT,
  creado_en: CREATED_AT,
  usado_en: null,
  invalidado_en: null,
  ...patch,
});

const insertToken = (runner: QueryRunner, row: TokenRow): Promise<unknown> =>
  runner.query(
    `INSERT INTO token_cuenta (usuario_id, tipo, token_hash, expira_en, creado_en, usado_en, invalidado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.usuario_id,
      row.tipo,
      row.token_hash,
      row.expira_en,
      row.creado_en,
      row.usado_en,
      row.invalidado_en,
    ],
  );

/**
 * Restricciones de `usuario` y `token_cuenta` (plan 001 §4) sobre la BD migrada por el arnés. Prueba el esquema, no
 * los permisos de la app: se conecta como el dueño (`DATABASE_MIGRATION_URL`), que puede borrar un `usuario` para
 * comprobar la cascada (`nimbo_app` no tiene `DELETE` en `usuario`, plan 003 §4 (b)).
 */
describe('esquema de identity (CA-1, CA-3, CA-17, RN-4)', () => {
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

  it('CA-1: acepta un cliente con aceptación y un token de verificación', async () => {
    const user = aClient();

    await insertUser(runner, user);
    await insertToken(runner, aToken(user.id));

    const rows = (await runner.query(
      'SELECT correo_verificado, estado FROM usuario WHERE id = $1',
      [user.id],
    )) as { correo_verificado: boolean; estado: string }[];
    const [row] = rows;
    expect(row).toEqual({ correo_verificado: false, estado: 'activa' });
  });

  it.each([
    ['un `rol` fuera de los cuatro', { rol: 'SUPERADMIN' }, 'ck_usuario_rol'],
    ['un `estado` inválido', { estado: 'borrada' }, 'ck_usuario_estado'],
    ['un correo sin normalizar', { correo: ' Ana@Nimbo.me' }, 'ck_usuario_correo_normalizado'],
    ['un nombre vacío', { nombre: '   ' }, 'ck_usuario_nombre'],
    [
      'un `CLIENT` sin aceptación',
      { terminos_aceptados_en: null },
      'ck_usuario_aceptacion_cliente',
    ],
  ])('CA-1: rechaza %s', async (_label, patch, constraint) => {
    await expect(violatedConstraint(insertUser(runner, aClient(patch)))).resolves.toBe(constraint);
  });

  it('CA-1: un rol interno no necesita aceptación', async () => {
    const internal = aClient({
      rol: 'SUPPORT',
      version_terminos: null,
      version_privacidad: null,
      terminos_aceptados_en: null,
    });

    await expect(violatedConstraint(insertUser(runner, internal))).resolves.toBeUndefined();
  });

  it('CA-3: rechaza un segundo `usuario` con el mismo correo', async () => {
    const first = aClient();
    await insertUser(runner, first);

    await expect(
      violatedConstraint(insertUser(runner, aClient({ correo: first.correo }))),
    ).resolves.toBe('uq_usuario_correo');
  });

  it.each([
    ['un `token_hash` que no es hex de 64', { token_hash: 'A'.repeat(64) }, 'ck_token_cuenta_hash'],
    ['`expira_en <= creado_en`', { expira_en: CREATED_AT }, 'ck_token_cuenta_vigencia'],
    [
      '`usado_en` e `invalidado_en` a la vez',
      { usado_en: CREATED_AT, invalidado_en: CREATED_AT },
      'ck_token_cuenta_un_final',
    ],
    ['un `tipo` desconocido', { tipo: 'invitacion' }, 'ck_token_cuenta_tipo'],
  ])('CA-17: rechaza %s', async (_label, patch, constraint) => {
    const user = aClient();
    await insertUser(runner, user);

    await expect(violatedConstraint(insertToken(runner, aToken(user.id, patch)))).resolves.toBe(
      constraint,
    );
  });

  it('RN-4: rechaza un segundo token vigente del mismo `(usuario_id, tipo)`', async () => {
    const user = aClient();
    await insertUser(runner, user);
    await insertToken(runner, aToken(user.id));

    await expect(
      violatedConstraint(insertToken(runner, aToken(user.id, { token_hash: HASH_B }))),
    ).resolves.toBe('uq_token_cuenta_vigente');
  });

  it('RN-4: admite un token nuevo cuando el anterior quedó invalidado', async () => {
    const user = aClient();
    await insertUser(runner, user);
    await insertToken(runner, aToken(user.id, { invalidado_en: CREATED_AT }));

    await expect(
      violatedConstraint(insertToken(runner, aToken(user.id, { token_hash: HASH_B }))),
    ).resolves.toBeUndefined();
  });

  it('CA-17: rechaza un `token_hash` repetido', async () => {
    const [first, second] = [aClient(), aClient()];
    await insertUser(runner, first);
    await insertUser(runner, second);
    await insertToken(runner, aToken(first.id));

    await expect(violatedConstraint(insertToken(runner, aToken(second.id)))).resolves.toBe(
      'uq_token_cuenta_token_hash',
    );
  });

  it('CA-17: borrar el usuario borra sus tokens en cascada', async () => {
    const user = aClient();
    await insertUser(runner, user);
    await insertToken(runner, aToken(user.id));

    await runner.query('DELETE FROM usuario WHERE id = $1', [user.id]);

    const rows = (await runner.query('SELECT 1 FROM token_cuenta WHERE usuario_id = $1', [
      user.id,
    ])) as unknown[];
    expect(rows).toHaveLength(0);
  });
});
