import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transacciones del pago simulado (spec 009 CA-3, CA-4, plan §3; DF-68). Una fila por intento cobrado, `aprobada` o
 * `rechazada`; nunca se borra ni cambia (RN-7): `RESTRICT` hacia `usuario` y RLS solo con `SELECT` e `INSERT` del
 * cliente dueño. Del número de tarjeta solo se guardan la marca y los últimos 4 dígitos (RN-3). La referencia
 * `SIM-{año}-{secuencia}` la arma la aplicación con `transaccion_referencia_seq` (RN-5).
 */
export class CrearTransaccion20261014100100 implements MigrationInterface {
  name = 'CrearTransaccion20261014100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SEQUENCE transaccion_referencia_seq');
    await queryRunner.query(`
      CREATE TABLE transaccion (
        id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id       uuid        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        plan_id          uuid        NOT NULL REFERENCES plan(id),
        monto_centavos   integer     NOT NULL CHECK (monto_centavos > 0),
        estado           varchar(20) NOT NULL CHECK (estado IN ('aprobada', 'rechazada')),
        marca_tarjeta    varchar(20) NOT NULL,
        tarjeta_ultimos4 char(4)     NOT NULL CHECK (tarjeta_ultimos4 ~ '^[0-9]{4}$'),
        referencia       varchar(20) NOT NULL UNIQUE,
        creado_en        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_transaccion_usuario_creado_en ON transaccion (usuario_id, creado_en DESC)',
    );
    await queryRunner.query('ALTER TABLE transaccion ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE transaccion FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY transaccion_cliente_lectura ON transaccion FOR SELECT TO nimbo_app
        USING (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
    await queryRunner.query(`
      CREATE POLICY transaccion_cliente_alta ON transaccion FOR INSERT TO nimbo_app
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY transaccion_cliente_alta ON transaccion');
    await queryRunner.query('DROP POLICY transaccion_cliente_lectura ON transaccion');
    await queryRunner.query('DROP TABLE transaccion');
    await queryRunner.query('DROP SEQUENCE transaccion_referencia_seq');
  }
}
