import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baja de planes del catálogo (spec 011 CA-10, CA-11, RN-4; plan §3; DF-65). `desactivado_en` nulo: el plan se ofrece;
 * con fecha: desactivado, sin reactivación. Personal nunca se desactiva, el máximo por archivo no supera la cuota ni
 * 2 GB (RNF-02) y el nombre es único sin distinguir mayúsculas ni espacios en los extremos. `plan` es el catálogo
 * público: sin RLS. Fecha posterior a las de 011 T-01 y T-02 (acordado 2026-10-08).
 */
export class AgregarDesactivadoEnAPlan20261014160000 implements MigrationInterface {
  name = 'AgregarDesactivadoEnAPlan20261014160000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE plan ADD COLUMN desactivado_en timestamptz NULL,
        ADD CONSTRAINT ck_plan_personal_activo CHECK (slug <> 'personal' OR desactivado_en IS NULL),
        ADD CONSTRAINT ck_plan_max_archivo
          CHECK (max_archivo_bytes <= cuota_bytes AND max_archivo_bytes <= 2147483648)
    `);
    await queryRunner.query('CREATE UNIQUE INDEX uq_plan_nombre ON plan (lower(btrim(nombre)))');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX uq_plan_nombre');
    await queryRunner.query(`
      ALTER TABLE plan DROP CONSTRAINT ck_plan_max_archivo,
        DROP CONSTRAINT ck_plan_personal_activo,
        DROP COLUMN desactivado_en
    `);
  }
}
