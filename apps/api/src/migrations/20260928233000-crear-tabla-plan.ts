import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `plan` (spec 006a, RN-2, CA-7). El catálogo no tiene RLS: no guarda datos de una cuenta.
 */
export class CrearTablaPlan20260928233000 implements MigrationInterface {
  name = 'CrearTablaPlan20260928233000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE plan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre VARCHAR(100) NOT NULL,
        slug VARCHAR(50) NOT NULL UNIQUE,
        descripcion TEXT,
        precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
        cuota_bytes BIGINT NOT NULL CHECK (cuota_bytes > 0),
        max_archivo_bytes BIGINT NOT NULL CHECK (max_archivo_bytes > 0),
        max_editores INTEGER NOT NULL CHECK (max_editores >= 0),
        consultas_agente_mensual INTEGER NOT NULL CHECK (consultas_agente_mensual >= 0),
        versiones_retenidas INTEGER NOT NULL CHECK (versiones_retenidas >= 1),
        dias_retencion_papelera INTEGER NOT NULL CHECK (dias_retencion_papelera >= 1),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS plan CASCADE;`);
  }
}
