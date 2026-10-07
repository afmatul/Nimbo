import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Carpetas (spec 006 CA-1, CA-3, CA-9, CA-11; plan §3; ADR-0011, DF-61). `ruta` es el camino materializado del E-R
 * (`/<id ancestro>/…/<id>/`, solo UUID): detecta ciclos y mueve un subárbol con un `UPDATE` por prefijo
 * (`text_pattern_ops`). `profundidad` es la cantidad de niveles de la carpeta (la raíz no cuenta).
 *
 * Papelera: `eliminado_en` y `purgar_en` van juntos (la fecha de purga se fija al eliminar, CA-19), y
 * `eliminado_con_carpeta_id` apunta a la carpeta cuya eliminación arrastró a esta (CA-11, CA-13). La unicidad de
 * nombre es entre carpetas hermanas vivas, sin distinguir mayúsculas; la raíz (`NULL`) cuenta como un padre más.
 *
 * `idx_carpeta_raiz_creado` no está en el plan §3: `carpeta_padre_id IS NULL` no es una igualdad para el planificador,
 * así que `idx_carpeta_hijas` no da el orden del listado de la raíz y Postgres ordenaba todas las filas (`EXPLAIN` en
 * `folders-migrations.int-spec.ts`).
 */
export class CrearCarpeta20261001100000 implements MigrationInterface {
  name = 'CrearCarpeta20261001100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE carpeta (
        id                       uuid         PRIMARY KEY,
        propietario_id           uuid         NOT NULL REFERENCES usuario(id),
        carpeta_padre_id         uuid         REFERENCES carpeta(id) ON DELETE SET NULL,
        nombre                   varchar(255) NOT NULL,
        ruta                     text         NOT NULL,
        profundidad              smallint     NOT NULL CHECK (profundidad >= 1),
        creado_en                timestamptz  NOT NULL,
        actualizado_en           timestamptz  NOT NULL,
        eliminado_en             timestamptz,
        purgar_en                timestamptz,
        eliminado_con_carpeta_id uuid         REFERENCES carpeta(id),
        CONSTRAINT ck_carpeta_padre CHECK (carpeta_padre_id IS NULL OR carpeta_padre_id <> id),
        CONSTRAINT ck_carpeta_papelera CHECK (
          (eliminado_en IS NULL) = (purgar_en IS NULL)
          AND (eliminado_con_carpeta_id IS NULL OR eliminado_en IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_carpeta_hermanos_nombre ON carpeta (propietario_id, carpeta_padre_id, lower(nombre))
        NULLS NOT DISTINCT WHERE eliminado_en IS NULL
    `);
    await queryRunner.query(
      'CREATE INDEX idx_carpeta_ruta ON carpeta (propietario_id, ruta text_pattern_ops)',
    );
    await queryRunner.query(`
      CREATE INDEX idx_carpeta_hijas ON carpeta (propietario_id, carpeta_padre_id, creado_en DESC, id DESC)
        WHERE eliminado_en IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_carpeta_raiz_creado ON carpeta (propietario_id, creado_en DESC, id DESC)
        WHERE eliminado_en IS NULL AND carpeta_padre_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_carpeta_papelera ON carpeta (propietario_id, eliminado_en DESC, id DESC)
        WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_carpeta_purga ON carpeta (purgar_en)
        WHERE eliminado_en IS NOT NULL AND eliminado_con_carpeta_id IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE carpeta');
  }
}
