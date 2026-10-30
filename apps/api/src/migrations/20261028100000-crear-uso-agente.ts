import type { MigrationInterface, QueryRunner } from 'typeorm';

const IS_OWNER = "nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id()";
const WRITABLE_COLUMNS = 'consultas, actualizado_en';

/**
 * Contador de consultas del agente (spec 020 RF-34, plan §3; DF-25). Una fila por cliente y periodo: el periodo nuevo
 * es una fila nueva y el contador empieza en cero sin trabajo de reinicio (CA-13). `periodo_inicio` es el inicio del
 * periodo de la suscripción de pago o del mes de Guatemala (Personal). `CHECK` impide bajar de cero.
 *
 * - `ON DELETE CASCADE`: el uso no se conserva sin su cuenta.
 * - RLS forzada con el menor privilegio de `suscripcion` (`20261017100000`): lectura, alta y cambio del propio cliente,
 *   sin política de borrado, y `nimbo_app` solo actualiza `consultas` y `actualizado_en`. Sin política para roles
 *   internos ni para `nimbo_app` sin actor: 0 filas. El borrado en cascada lo ejecuta el dueño de la tabla.
 */
export class CrearUsoAgente20261028100000 implements MigrationInterface {
  name = 'CrearUsoAgente20261028100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE uso_agente (
        usuario_id     uuid        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        periodo_inicio timestamptz NOT NULL,
        consultas      integer     NOT NULL,
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_uso_agente PRIMARY KEY (usuario_id, periodo_inicio),
        CONSTRAINT ck_uso_agente_consultas CHECK (consultas >= 0)
      )
    `);
    await queryRunner.query('REVOKE UPDATE, DELETE ON uso_agente FROM nimbo_app');
    await queryRunner.query(`GRANT UPDATE (${WRITABLE_COLUMNS}) ON uso_agente TO nimbo_app`);
    await this.enableRowSecurity(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY uso_agente_cliente_cambio ON uso_agente');
    await queryRunner.query('DROP POLICY uso_agente_cliente_alta ON uso_agente');
    await queryRunner.query('DROP POLICY uso_agente_cliente_lectura ON uso_agente');
    await queryRunner.query('DROP TABLE uso_agente');
  }

  private async enableRowSecurity(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE uso_agente ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE uso_agente FORCE ROW LEVEL SECURITY');
    await queryRunner.query(
      `CREATE POLICY uso_agente_cliente_lectura ON uso_agente FOR SELECT TO nimbo_app USING (${IS_OWNER})`,
    );
    await queryRunner.query(
      `CREATE POLICY uso_agente_cliente_alta ON uso_agente FOR INSERT TO nimbo_app WITH CHECK (${IS_OWNER})`,
    );
    await queryRunner.query(`
      CREATE POLICY uso_agente_cliente_cambio ON uso_agente FOR UPDATE TO nimbo_app
        USING (${IS_OWNER}) WITH CHECK (${IS_OWNER})
    `);
  }
}
