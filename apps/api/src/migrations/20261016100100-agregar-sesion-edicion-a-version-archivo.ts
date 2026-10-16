import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlace de una versión con la sesión de edición que la generó (spec 016, plan §3; DF-05, ADR-0012). Va después de
 * la de 014 (`numero`, `restaurada_de_numero`), que no la trae.
 *
 * - `uq_version_archivo_sesion_edicion` es la idempotencia del guardado (CA-10): el mismo aviso dos veces no crea dos
 *   versiones (los `NULL` de las demás versiones no chocan).
 * - `ck_version_archivo_sesion_origen`: una versión `edicion` tiene sesión y ninguna otra la tiene. Las filas
 *   existentes son de carga o restauración, sin sesión: el `CHECK` se valida sin cambiar datos.
 * - Los autores no se copian: salen de `participacion` de la sesión (RN-5, DF-18).
 */
export class AgregarSesionEdicionAVersionArchivo20261016100100 implements MigrationInterface {
  name = 'AgregarSesionEdicionAVersionArchivo20261016100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE version_archivo
        ADD COLUMN sesion_edicion_id uuid
          CONSTRAINT fk_version_archivo_sesion_edicion REFERENCES sesion_edicion(id),
        ADD CONSTRAINT uq_version_archivo_sesion_edicion UNIQUE (sesion_edicion_id),
        ADD CONSTRAINT ck_version_archivo_sesion_origen
          CHECK ((origen = 'edicion') = (sesion_edicion_id IS NOT NULL))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE version_archivo
        DROP CONSTRAINT ck_version_archivo_sesion_origen,
        DROP CONSTRAINT uq_version_archivo_sesion_edicion,
        DROP COLUMN sesion_edicion_id
    `);
  }
}
