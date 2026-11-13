import type { MigrationInterface, QueryRunner } from 'typeorm';

/** La propietaria del archivo: la única que lee o escribe su extracto (misma condición que `indexacion`, 012). */
const OWNER_OF_FILE = `nimbo_actor_role() = 'CLIENT'
  AND EXISTS (SELECT 1 FROM archivo a
               WHERE a.id = miniatura.archivo_id AND a.propietario_id = nimbo_actor_id())`;

/**
 * Extracto de texto de la versión vigente de un `.docx` para su miniatura en el explorador (una fila por versión).
 * `texto` es `NULL` cuando el documento no tiene texto o no se puede leer: se guarda igual para no volver a leer el
 * archivo en cada petición. `ON DELETE CASCADE` la borra con su archivo o su versión (la cascada no pasa por RLS). El
 * contenido solo lo lee o inserta la propietaria por la base (menor privilegio: sin `UPDATE` ni `DELETE`); quien recibe
 * el archivo compartido lo ve a través del servicio, que actúa como la propietaria tras comprobar su acceso. Sin datos
 * que migrar: se genera al pedirla.
 */
export class CrearMiniaturaDeDocumento20261112100000 implements MigrationInterface {
  name = 'CrearMiniaturaDeDocumento20261112100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE miniatura (
        id                 uuid        PRIMARY KEY,
        archivo_id         uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        version_archivo_id uuid        NOT NULL REFERENCES version_archivo(id) ON DELETE CASCADE,
        texto              text,
        creado_en          timestamptz NOT NULL,
        CONSTRAINT uq_miniatura_version UNIQUE (version_archivo_id),
        CONSTRAINT ck_miniatura_texto CHECK (texto IS NULL OR char_length(texto) BETWEEN 1 AND 600)
      )
    `);
    await queryRunner.query('CREATE INDEX idx_miniatura_archivo ON miniatura (archivo_id)');
    await queryRunner.query('ALTER TABLE miniatura ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE miniatura FORCE ROW LEVEL SECURITY');
    await queryRunner.query(
      `CREATE POLICY miniatura_lectura ON miniatura FOR SELECT TO nimbo_app USING (${OWNER_OF_FILE})`,
    );
    await queryRunner.query(
      `CREATE POLICY miniatura_alta ON miniatura FOR INSERT TO nimbo_app WITH CHECK (${OWNER_OF_FILE})`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY miniatura_alta ON miniatura');
    await queryRunner.query('DROP POLICY miniatura_lectura ON miniatura');
    await queryRunner.query('DROP TABLE miniatura');
  }
}
