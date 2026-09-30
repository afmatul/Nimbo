import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `dispositivo` de la spec 002 (plan §4, D-4, resuelve DF-11): guarda el SHA-256 en hex del identificador de la
 * cookie de dispositivo, nunca el identificador. Un dispositivo es «nuevo» por cuenta: la misma huella puede
 * repetirse entre cuentas. Sin `nombre` (se deriva de `agente_usuario` al leer) ni `creado_en` (DF-57).
 */
export class CrearDispositivo20260929100000 implements MigrationInterface {
  name = 'CrearDispositivo20260929100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE dispositivo (
        id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id     uuid         NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
        huella_hash    char(64)     NOT NULL,
        agente_usuario varchar(512) NOT NULL DEFAULT '',
        ultima_ip      inet         NULL,
        ultimo_acceso  timestamptz  NOT NULL,
        CONSTRAINT ck_dispositivo_huella_hash CHECK (huella_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT uq_dispositivo_id_usuario_id UNIQUE (id, usuario_id)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_dispositivo_usuario_id_huella_hash ON dispositivo (usuario_id, huella_hash)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE dispositivo');
  }
}
