import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suscripción de cada cliente (spec 009 CA-1, plan §3; DF-69). Una fila por cliente (`uq_suscripcion_usuario`, DF-25 y
 * DF-35): Personal sin vencimiento (`vence_en` nulo) o un plan de pago de 30 días. Las columnas `estado` y
 * `plan_pendiente_id` las agrega la 010.
 *
 * - `ON DELETE CASCADE`: la suscripción no se conserva sin su cuenta (las transacciones y facturas sí, RN-7).
 * - RLS forzado, solo el cliente dueño. Ningún rol interno lee filas: la 011 obtiene nombres y conteos por funciones
 *   de lectura (T-03, ADR-0021).
 */
export class CrearSuscripcion20261014100000 implements MigrationInterface {
  name = 'CrearSuscripcion20261014100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE suscripcion (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id     uuid        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        plan_id        uuid        NOT NULL REFERENCES plan(id),
        iniciado_en    timestamptz NOT NULL DEFAULT now(),
        vence_en       timestamptz,
        creado_en      timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_suscripcion_usuario UNIQUE (usuario_id)
      )
    `);
    await queryRunner.query('ALTER TABLE suscripcion ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE suscripcion FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY suscripcion_cliente ON suscripcion TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY suscripcion_cliente ON suscripcion');
    await queryRunner.query('DROP TABLE suscripcion');
  }
}
