import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sesiones de carga (spec 005 CA-2, CA-9, CA-23; plan §4). La fila `activa` y no vencida **es** la reserva de cuota
 * (RN-13, D-5). `archivo_id` y `version_id` son ids reservados desde el inicio (la clave de objeto final se fija al
 * iniciar) y **no** tienen FK: hasta completar no existe la fila a la que apuntar; la integridad la dan el
 * `UNIQUE(clave_objeto)` de `version_archivo` y el compare-and-set de `estado`. `nombre`, `clave_objeto` y
 * `upload_id` nunca salen de la API ni entran en una bitácora.
 */
export class CrearCarga20260930100200 implements MigrationInterface {
  name = 'CrearCarga20260930100200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE carga (
        id                 uuid         PRIMARY KEY,
        propietario_id     uuid         NOT NULL REFERENCES usuario(id),
        nombre             varchar(255) NOT NULL,
        conservar_ambos    boolean      NOT NULL DEFAULT false,
        tamano_bytes       bigint       NOT NULL CHECK (tamano_bytes > 0),
        modo               varchar(10)  NOT NULL CHECK (modo IN ('simple', 'por_partes')),
        estado             varchar(10)  NOT NULL DEFAULT 'activa'
                             CHECK (estado IN ('activa', 'completada', 'rechazada', 'cancelada', 'expirada')),
        motivo_rechazo     varchar(14)  CHECK (motivo_rechazo IN ('tamano', 'tipo_invalido')),
        archivo_id         uuid         NOT NULL,
        version_id         uuid         NOT NULL,
        clave_objeto       varchar(200) NOT NULL,
        upload_id          varchar(200),
        partes_totales     integer      CHECK (partes_totales > 0),
        tamano_parte_bytes bigint       CHECK (tamano_parte_bytes > 0),
        expira_en          timestamptz  NOT NULL,
        creada_en          timestamptz  NOT NULL,
        actualizada_en     timestamptz  NOT NULL,
        finalizada_en      timestamptz,
        CONSTRAINT ck_carga_partes CHECK (
          (modo = 'por_partes')
          = (upload_id IS NOT NULL AND partes_totales IS NOT NULL AND tamano_parte_bytes IS NOT NULL)
        ),
        CONSTRAINT ck_carga_rechazo CHECK ((estado = 'rechazada') = (motivo_rechazo IS NOT NULL))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX idx_carga_propietario_activa ON carga (propietario_id) WHERE estado = 'activa'",
    );
    await queryRunner.query(
      "CREATE INDEX idx_carga_activa_expira ON carga (expira_en) WHERE estado = 'activa'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE carga');
  }
}
