import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Espacio usado por cuenta (spec 005 CA-4, RN-10; plan §4; 001 §4 lo difiere a esta spec, DF-38). Es la única columna
 * de `usuario` que escribe `storage`, solo por `IQuotaRepository` (D-5, DF-59). Las reservas de cargas en curso no se
 * suman aquí: son las filas `carga` activas.
 */
export class AgregarEspacioUsadoAUsuario20260930100000 implements MigrationInterface {
  name = 'AgregarEspacioUsadoAUsuario20260930100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE usuario ADD COLUMN espacio_usado bigint NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE usuario ADD CONSTRAINT ck_usuario_espacio_usado CHECK (espacio_usado >= 0)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE usuario DROP CONSTRAINT ck_usuario_espacio_usado');
    await queryRunner.query('ALTER TABLE usuario DROP COLUMN espacio_usado');
  }
}
