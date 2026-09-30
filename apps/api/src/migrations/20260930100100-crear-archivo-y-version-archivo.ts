import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Archivos y sus versiones (spec 005 CA-1, CA-6; plan §4; ADR-0011). Sin `tipo_mime` (017), `carpeta_id` (006) ni
 * `checksum` (YAGNI). `archivo.tamano_bytes` es el de la versión actual (denormalizado, DF-33). `version_actual_id`
 * y `version_archivo.archivo_id` forman un ciclo: la FK de `archivo` es diferida para insertar ambas filas en la
 * misma transacción. La clave de objeto (`u/{propietario}/{archivo}/{version}`) nunca sale de la API.
 */
export class CrearArchivoYVersionArchivo20260930100100 implements MigrationInterface {
  name = 'CrearArchivoYVersionArchivo20260930100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE archivo (
        id                uuid         PRIMARY KEY,
        propietario_id    uuid         NOT NULL REFERENCES usuario(id),
        nombre            varchar(255) NOT NULL,
        tipo              varchar(10)  NOT NULL
                            CHECK (tipo IN ('docx', 'pdf', 'texto', 'xlsx', 'pptx', 'imagen', 'otro')),
        tamano_bytes      bigint       NOT NULL CHECK (tamano_bytes > 0),
        version_actual_id uuid         NOT NULL,
        creado_en         timestamptz  NOT NULL,
        actualizado_en    timestamptz  NOT NULL,
        eliminado_en      timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE version_archivo (
        id           uuid         PRIMARY KEY,
        archivo_id   uuid         NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        origen       varchar(12)  NOT NULL
                       CHECK (origen IN ('carga', 'edicion', 'restauracion', 'optimizacion')),
        clave_objeto varchar(200) NOT NULL UNIQUE,
        tamano_bytes bigint       NOT NULL CHECK (tamano_bytes > 0),
        creado_por   uuid         NOT NULL REFERENCES usuario(id),
        creada_en    timestamptz  NOT NULL
      )
    `);
    await queryRunner.query(`
      ALTER TABLE archivo ADD CONSTRAINT fk_archivo_version_actual
        FOREIGN KEY (version_actual_id) REFERENCES version_archivo(id) DEFERRABLE INITIALLY DEFERRED
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_archivo_propietario_nombre ON archivo (propietario_id, lower(nombre)) WHERE eliminado_en IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX idx_archivo_propietario_creado ON archivo (propietario_id, creado_en DESC, id DESC) WHERE eliminado_en IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX idx_version_archivo_archivo ON version_archivo (archivo_id, creada_en DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE version_archivo CASCADE');
    await queryRunner.query('DROP TABLE archivo');
  }
}
