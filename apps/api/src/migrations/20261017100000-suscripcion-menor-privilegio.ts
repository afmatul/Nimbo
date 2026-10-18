import type { MigrationInterface, QueryRunner } from 'typeorm';

const IS_OWNER = "nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id()";
const WRITABLE_COLUMNS = 'plan_id, iniciado_en, vence_en, actualizado_en';

/**
 * Menor privilegio en `suscripcion` (spec 009; revisión del PR #62, #10), como `transaccion` y `factura`: la política
 * `FOR ALL` de la 009 se parte en lectura, alta y cambio, sin política de borrado, y `nimbo_app` solo puede actualizar
 * las columnas que escribe el cobro. Así el cliente no puede borrar su fila ni cambiar `usuario_id` por su cuenta. El
 * borrado en cascada desde `usuario` lo ejecuta el dueño de la tabla y no depende de estos permisos.
 */
export class SuscripcionMenorPrivilegio20261017100000 implements MigrationInterface {
  name = 'SuscripcionMenorPrivilegio20261017100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('REVOKE UPDATE, DELETE ON suscripcion FROM nimbo_app');
    await queryRunner.query(`GRANT UPDATE (${WRITABLE_COLUMNS}) ON suscripcion TO nimbo_app`);
    await queryRunner.query('DROP POLICY suscripcion_cliente ON suscripcion');
    await queryRunner.query(
      `CREATE POLICY suscripcion_cliente_lectura ON suscripcion FOR SELECT TO nimbo_app USING (${IS_OWNER})`,
    );
    await queryRunner.query(
      `CREATE POLICY suscripcion_cliente_alta ON suscripcion FOR INSERT TO nimbo_app WITH CHECK (${IS_OWNER})`,
    );
    await queryRunner.query(`
      CREATE POLICY suscripcion_cliente_cambio ON suscripcion FOR UPDATE TO nimbo_app
        USING (${IS_OWNER}) WITH CHECK (${IS_OWNER})
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY suscripcion_cliente_cambio ON suscripcion');
    await queryRunner.query('DROP POLICY suscripcion_cliente_alta ON suscripcion');
    await queryRunner.query('DROP POLICY suscripcion_cliente_lectura ON suscripcion');
    await queryRunner.query(`
      CREATE POLICY suscripcion_cliente ON suscripcion TO nimbo_app
        USING (${IS_OWNER}) WITH CHECK (${IS_OWNER})
    `);
    await queryRunner.query(`REVOKE UPDATE (${WRITABLE_COLUMNS}) ON suscripcion FROM nimbo_app`);
    await queryRunner.query('GRANT UPDATE, DELETE ON suscripcion TO nimbo_app');
  }
}
