import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Número de versión, versión de origen de una restauración y cargas que reemplazan un archivo (spec 014 CA-1, CA-4,
 * CA-9; plan §3; DF-65). Antes de 014 cada archivo tiene exactamente una versión, así que `DEFAULT 1` numera bien las
 * filas existentes sin un `UPDATE` bajo RLS; después se quita para que todo alta diga su número.
 * `restaurada_de_numero` es un número y no una FK: sobrevive a la poda de su versión (los números no se reutilizan).
 * `uq_version_archivo_numero` es la red de seguridad de la numeración y sirve también para listar por `numero DESC`.
 * Las columnas nuevas heredan las políticas RLS de `version_archivo` y `carga`.
 */
export class VersionesNumeroYRestauracion20261008100000 implements MigrationInterface {
  name = 'VersionesNumeroYRestauracion20261008100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE version_archivo
        ADD COLUMN numero integer NOT NULL DEFAULT 1,
        ADD COLUMN restaurada_de_numero integer
    `);
    await queryRunner.query('ALTER TABLE version_archivo ALTER COLUMN numero DROP DEFAULT');
    await queryRunner.query(`
      ALTER TABLE version_archivo ADD CONSTRAINT ck_version_numero CHECK (
        numero > 0 AND (restaurada_de_numero IS NULL OR restaurada_de_numero BETWEEN 1 AND numero - 1)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_version_archivo_numero ON version_archivo (archivo_id, numero)',
    );
    await queryRunner.query(
      'ALTER TABLE carga ADD COLUMN reemplaza boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE carga DROP COLUMN reemplaza');
    await queryRunner.query('DROP INDEX uq_version_archivo_numero');
    await queryRunner.query(`
      ALTER TABLE version_archivo
        DROP CONSTRAINT ck_version_numero,
        DROP COLUMN restaurada_de_numero,
        DROP COLUMN numero
    `);
  }
}
