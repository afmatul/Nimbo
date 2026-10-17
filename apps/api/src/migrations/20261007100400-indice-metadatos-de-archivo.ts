import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice de la lista de metadatos de un cliente para Soporte y Administración (spec 011 CA-13; plan §3): filtra por
 * dueño y ordena por `actualizado_en DESC, id DESC`, incluidos los archivos en papelera.
 */
export class IndiceMetadatosDeArchivo20261007100400 implements MigrationInterface {
  name = 'IndiceMetadatosDeArchivo20261007100400';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX idx_archivo_propietario_actualizado ON archivo (propietario_id, actualizado_en DESC, id DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_archivo_propietario_actualizado');
  }
}
