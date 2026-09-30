import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `sesion` de la spec 002 (plan §4): guarda el SHA-256 en hex del secreto de refresco vigente y del justo
 * anterior (gracia de rotación, D-3), nunca los tokens. `usuario_id`, `refresh_anterior_hash`, `rotado_en` y
 * `ultimo_uso` son agregados al E-R (DF-57); la FK compuesta garantiza que `usuario_id` es el dueño del dispositivo.
 * La vigencia por inactividad no se guarda: se calcula con `ultimo_uso` (D-2).
 */
export class CrearSesion20260929100100 implements MigrationInterface {
  name = 'CrearSesion20260929100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sesion (
        id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id            uuid        NOT NULL,
        dispositivo_id        uuid        NOT NULL,
        refresh_hash          char(64)    NOT NULL,
        refresh_anterior_hash char(64)    NULL,
        rotado_en             timestamptz NULL,
        creada_en             timestamptz NOT NULL,
        ultimo_uso            timestamptz NOT NULL,
        expira_en             timestamptz NOT NULL,
        revocada_en           timestamptz NULL,
        CONSTRAINT fk_sesion_dispositivo_usuario FOREIGN KEY (dispositivo_id, usuario_id)
          REFERENCES dispositivo (id, usuario_id) ON DELETE CASCADE,
        CONSTRAINT ck_sesion_refresh_hash CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_sesion_refresh_anterior_hash
          CHECK (refresh_anterior_hash IS NULL OR refresh_anterior_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_sesion_rotacion CHECK ((refresh_anterior_hash IS NULL) = (rotado_en IS NULL)),
        CONSTRAINT ck_sesion_vigencia CHECK (expira_en > creada_en AND ultimo_uso >= creada_en)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_sesion_usuario_id_ultimo_uso ON sesion (usuario_id, ultimo_uso DESC)
        WHERE revocada_en IS NULL
    `);
    await queryRunner.query(
      'CREATE INDEX idx_sesion_dispositivo_id_usuario_id ON sesion (dispositivo_id, usuario_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sesion');
  }
}
