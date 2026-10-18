import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlace de alta interna (spec 011 CA-5; plan §3): `token_cuenta` admite el tipo `alta_interna` (hash, un solo uso y un
 * solo vigente por cuenta y tipo, como los de 001 y 002). El `down` borra esos tokens antes de restaurar el CHECK de 001.
 */
export class AgregarAltaInternaATokenCuenta20261007100100 implements MigrationInterface {
  name = 'AgregarAltaInternaATokenCuenta20261007100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE token_cuenta DROP CONSTRAINT ck_token_cuenta_tipo,
        ADD CONSTRAINT ck_token_cuenta_tipo CHECK (tipo IN ('verificacion', 'recuperacion', 'alta_interna'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM token_cuenta WHERE tipo = 'alta_interna'");
    await queryRunner.query(`
      ALTER TABLE token_cuenta DROP CONSTRAINT ck_token_cuenta_tipo,
        ADD CONSTRAINT ck_token_cuenta_tipo CHECK (tipo IN ('verificacion', 'recuperacion'))
    `);
  }
}
