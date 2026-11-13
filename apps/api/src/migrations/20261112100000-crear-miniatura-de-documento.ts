import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extracto de texto de la versión vigente de un `.docx` para su miniatura en el explorador (una fila por versión).
 * `ON DELETE CASCADE` la borra con su archivo o su versión; `texto` es contenido del archivo, así que solo la
 * propietaria lo lee o escribe por la base (misma política que `indexacion`, 012: el destinatario lo ve a través del
 * servicio, que actúa como la propietaria tras comprobar su acceso). Sin datos que migrar: se genera al pedirla.
 */
export class CrearMiniaturaDeDocumento20261112100000 implements MigrationInterface {
  name = 'CrearMiniaturaDeDocumento20261112100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE miniatura (
        id                 uuid        PRIMARY KEY,
        archivo_id         uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        version_archivo_id uuid        NOT NULL REFERENCES version_archivo(id) ON DELETE CASCADE,
        texto              text        NOT NULL,
        creado_en          timestamptz NOT NULL,
        CONSTRAINT uq_miniatura_version UNIQUE (version_archivo_id),
        CONSTRAINT ck_miniatura_texto CHECK (char_length(texto) <= 600)
      )
    `);
    await queryRunner.query('CREATE INDEX idx_miniatura_archivo ON miniatura (archivo_id)');
    await queryRunner.query('ALTER TABLE miniatura ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE miniatura FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY miniatura_cliente ON miniatura TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM archivo a
                                 WHERE a.id = miniatura.archivo_id AND a.propietario_id = nimbo_actor_id()))
        WITH CHECK (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM archivo a
                                 WHERE a.id = miniatura.archivo_id AND a.propietario_id = nimbo_actor_id()))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY miniatura_cliente ON miniatura');
    await queryRunner.query('DROP TABLE miniatura');
  }
}
