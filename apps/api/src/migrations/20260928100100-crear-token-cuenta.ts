import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `token_cuenta` de la spec 001 (plan §4): guarda el SHA-256 en hex del token opaco, nunca el token (D-19).
 * `invalidado_en` y `creado_en` son nuevos respecto del E-R (DF-53). Un solo token vigente por cuenta y tipo (RN-4).
 */
export class CrearTokenCuenta20260928100100 implements MigrationInterface {
  name = 'CrearTokenCuenta20260928100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE token_cuenta (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id    uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
        tipo          varchar(16) NOT NULL,
        token_hash    char(64)    NOT NULL,
        expira_en     timestamptz NOT NULL,
        usado_en      timestamptz NULL,
        invalidado_en timestamptz NULL,
        creado_en     timestamptz NOT NULL,
        CONSTRAINT ck_token_cuenta_tipo CHECK (tipo IN ('verificacion', 'recuperacion')),
        CONSTRAINT ck_token_cuenta_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_token_cuenta_vigencia CHECK (expira_en > creado_en),
        CONSTRAINT ck_token_cuenta_un_final CHECK (usado_en IS NULL OR invalidado_en IS NULL)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_token_cuenta_token_hash ON token_cuenta (token_hash)',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_token_cuenta_vigente ON token_cuenta (usuario_id, tipo)
        WHERE usado_en IS NULL AND invalidado_en IS NULL
    `);
    await queryRunner.query(
      'CREATE INDEX idx_token_cuenta_usuario_id ON token_cuenta (usuario_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE token_cuenta');
  }
}
