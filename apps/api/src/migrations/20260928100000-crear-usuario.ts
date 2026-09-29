import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `usuario` de la spec 001 (plan §4). Las fechas de negocio las escribe la aplicación con `IClock`; el
 * `DEFAULT now()` de `creado_en` es solo respaldo para inserciones de prueba de cuentas internas.
 */
export class CrearUsuario20260928100000 implements MigrationInterface {
  name = 'CrearUsuario20260928100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE usuario (
        id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre                varchar(100) NOT NULL,
        correo                varchar(254) NOT NULL,
        hash_clave            varchar(255) NOT NULL,
        rol                   varchar(16)  NOT NULL,
        estado                varchar(16)  NOT NULL DEFAULT 'activa',
        correo_verificado     boolean      NOT NULL DEFAULT false,
        version_terminos      varchar(20)  NULL,
        version_privacidad    varchar(20)  NULL,
        terminos_aceptados_en timestamptz  NULL,
        creado_en             timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_usuario_rol CHECK (rol IN ('CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR')),
        CONSTRAINT ck_usuario_estado CHECK (estado IN ('activa', 'suspendida')),
        CONSTRAINT ck_usuario_correo_normalizado CHECK (correo = lower(btrim(correo))),
        CONSTRAINT ck_usuario_nombre CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 100),
        CONSTRAINT ck_usuario_aceptacion_cliente CHECK (
          rol <> 'CLIENT'
          OR (version_terminos IS NOT NULL AND version_privacidad IS NOT NULL AND terminos_aceptados_en IS NOT NULL)
        )
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX uq_usuario_correo ON usuario (correo)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE usuario');
  }
}
