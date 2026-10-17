import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Código de empleado de las cuentas internas (spec 011 RN-5, Q-4; plan §3; DF-33). Obligatorio y único en las internas,
 * prohibido en los clientes, de 1 a 20 caracteres `[A-Z0-9-]` y guardado ya recortado y en mayúsculas: los CHECK son la
 * segunda barrera de `EmployeeCode` del dominio.
 *
 * No inventa códigos: si la base tiene cuentas internas (creadas a mano antes de 011, 003 D-3), falla con un mensaje
 * que dice cómo seguir.
 */
export class AgregarCodigoEmpleadoAUsuario20261007100000 implements MigrationInterface {
  name = 'AgregarCodigoEmpleadoAUsuario20261007100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await assertNoInternalAccounts(queryRunner);
    await queryRunner.query(`
      ALTER TABLE usuario ADD COLUMN codigo_empleado varchar(20) NULL,
        ADD CONSTRAINT ck_usuario_codigo_empleado_cliente CHECK (rol <> 'CLIENT' OR codigo_empleado IS NULL),
        ADD CONSTRAINT ck_usuario_codigo_empleado_interna CHECK (rol = 'CLIENT' OR codigo_empleado IS NOT NULL),
        ADD CONSTRAINT ck_usuario_codigo_empleado_formato CHECK (codigo_empleado ~ '^[A-Z0-9-]{1,20}$'),
        ADD CONSTRAINT ck_usuario_codigo_empleado_normalizado
          CHECK (codigo_empleado = upper(btrim(codigo_empleado)))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_usuario_codigo_empleado ON usuario (codigo_empleado)
        WHERE codigo_empleado IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX uq_usuario_codigo_empleado');
    await queryRunner.query(`
      ALTER TABLE usuario DROP CONSTRAINT ck_usuario_codigo_empleado_normalizado,
        DROP CONSTRAINT ck_usuario_codigo_empleado_formato,
        DROP CONSTRAINT ck_usuario_codigo_empleado_interna,
        DROP CONSTRAINT ck_usuario_codigo_empleado_cliente,
        DROP COLUMN codigo_empleado
    `);
  }
}

async function assertNoInternalAccounts(queryRunner: QueryRunner): Promise<void> {
  const [row] = (await queryRunner.query(
    "SELECT count(*)::int AS total FROM usuario WHERE rol <> 'CLIENT'",
  )) as { total: number }[];
  const total = row?.total ?? 0;
  if (total > 0) {
    throw new Error(
      `Hay ${String(total)} cuentas internas sin código de empleado (011 RN-5) y la migración no inventa códigos. ` +
        "Bórralas (DELETE FROM usuario WHERE rol <> 'CLIENT'), vuelve a migrar y créalas de nuevo con el alta " +
        'interna o con `pnpm --filter api admin:bootstrap`.',
    );
  }
}
