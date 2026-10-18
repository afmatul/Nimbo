import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Referencia del instrumento de pago (spec 010 RN-2, plan §3; ADR-0031): texto opaco que emite la pasarela al aprobar y
 * permite la renovación automática sin el cliente. Nunca lleva el número; solo existe en pagos aprobados. Va en claro
 * bajo la RLS forzada de `transaccion` (ADR-0031): las filas existentes quedan sin referencia (no se inventa una).
 */
export class ReferenciaDeInstrumento20261018100100 implements MigrationInterface {
  name = 'ReferenciaDeInstrumento20261018100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaccion
        ADD COLUMN referencia_instrumento varchar(64),
        ADD CONSTRAINT ck_transaccion_referencia_instrumento
          CHECK (estado = 'aprobada' OR referencia_instrumento IS NULL)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaccion
        DROP CONSTRAINT ck_transaccion_referencia_instrumento,
        DROP COLUMN referencia_instrumento
    `);
  }
}
