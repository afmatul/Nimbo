import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Archivos dentro de carpetas y en la papelera (spec 006 CA-3, CA-6, CA-11, CA-19; plan §3; DF-33). `carpeta_id`
 * `NULL` es la raíz. La unicidad de nombre de 005 pasa a ser por carpeta (la raíz cuenta como una más). Las columnas de
 * papelera siguen la regla de `carpeta`. `carga.carpeta_destino_id` no tiene FK, como `archivo_id` y `version_id`:
 * el destino se valida al iniciar y al completar la carga.
 *
 * `idx_archivo_raiz_creado` no está en el plan §3: sirve el listado de la raíz, que `idx_archivo_carpeta_creado` no
 * ordena porque `carpeta_id IS NULL` no es una igualdad para el planificador (ver `CrearCarpeta…`).
 *
 * El `down` recrea los índices de 005; falla si hay nombres repetidos en carpetas distintas, por eso se prueba sobre
 * una base vacía (como en 005).
 */
export class CarpetaYPapeleraEnArchivoYCarga20261001100100 implements MigrationInterface {
  name = 'CarpetaYPapeleraEnArchivoYCarga20261001100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE archivo
        ADD COLUMN carpeta_id uuid REFERENCES carpeta(id) ON DELETE SET NULL,
        ADD COLUMN purgar_en timestamptz,
        ADD COLUMN eliminado_con_carpeta_id uuid REFERENCES carpeta(id),
        ADD CONSTRAINT ck_archivo_papelera CHECK (
          (eliminado_en IS NULL) = (purgar_en IS NULL)
          AND (eliminado_con_carpeta_id IS NULL OR eliminado_en IS NOT NULL)
        )
    `);
    await queryRunner.query('DROP INDEX uq_archivo_propietario_nombre');
    await queryRunner.query('DROP INDEX idx_archivo_propietario_creado');
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_archivo_hermanos_nombre ON archivo (propietario_id, carpeta_id, lower(nombre))
        NULLS NOT DISTINCT WHERE eliminado_en IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_archivo_carpeta_creado ON archivo (propietario_id, carpeta_id, creado_en DESC, id DESC)
        WHERE eliminado_en IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_archivo_raiz_creado ON archivo (propietario_id, creado_en DESC, id DESC)
        WHERE eliminado_en IS NULL AND carpeta_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_archivo_papelera ON archivo (propietario_id, eliminado_en DESC, id DESC)
        WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_archivo_arrastrado ON archivo (eliminado_con_carpeta_id)
        WHERE eliminado_con_carpeta_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_archivo_purga ON archivo (purgar_en)
        WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL
    `);
    await queryRunner.query('ALTER TABLE carga ADD COLUMN carpeta_destino_id uuid');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE carga DROP COLUMN carpeta_destino_id');
    await queryRunner.query('DROP INDEX idx_archivo_purga');
    await queryRunner.query('DROP INDEX idx_archivo_arrastrado');
    await queryRunner.query('DROP INDEX idx_archivo_papelera');
    await queryRunner.query('DROP INDEX idx_archivo_raiz_creado');
    await queryRunner.query('DROP INDEX idx_archivo_carpeta_creado');
    await queryRunner.query('DROP INDEX uq_archivo_hermanos_nombre');
    await queryRunner.query(`
      ALTER TABLE archivo
        DROP CONSTRAINT ck_archivo_papelera,
        DROP COLUMN eliminado_con_carpeta_id,
        DROP COLUMN purgar_en,
        DROP COLUMN carpeta_id
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_archivo_propietario_nombre ON archivo (propietario_id, lower(nombre)) WHERE eliminado_en IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX idx_archivo_propietario_creado ON archivo (propietario_id, creado_en DESC, id DESC) WHERE eliminado_en IS NULL',
    );
  }
}
