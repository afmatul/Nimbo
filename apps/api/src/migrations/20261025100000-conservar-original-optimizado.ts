import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Original conservado por una optimización (spec 014b, plan §3; DF-21, ADR-0013). Va después de la de 016.
 *
 * - `conservada_hasta` nula = la versión cuenta en `espacio_usado`; con fecha = original conservado que no cuenta y se
 *   purga en esa fecha. Hoy no hay versiones `optimizacion`: toda fila queda nula, sin respaldo de datos.
 * - `ck_version_conservada_hasta`: la fecha es posterior a la creación (la misma regla que el dominio).
 * - `idx_version_archivo_conservada` es parcial: solo indexa originales y sirve a la búsqueda de vencidos.
 * - RLS y permisos sin cambios: la columna hereda `version_archivo_cliente`.
 */
export class ConservarOriginalOptimizado20261025100000 implements MigrationInterface {
  name = 'ConservarOriginalOptimizado20261025100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE version_archivo
        ADD COLUMN conservada_hasta timestamptz,
        ADD CONSTRAINT ck_version_conservada_hasta
          CHECK (conservada_hasta IS NULL OR conservada_hasta > creada_en)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_version_archivo_conservada ON version_archivo (conservada_hasta)
        WHERE conservada_hasta IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_version_archivo_conservada');
    await queryRunner.query(`
      ALTER TABLE version_archivo
        DROP CONSTRAINT ck_version_conservada_hasta,
        DROP COLUMN conservada_hasta
    `);
  }
}
