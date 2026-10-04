import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accesos rápidos de la barra lateral (spec 006 CA-27 y CA-28, plan §9.2; ADR-0005, ADR-0011; DF-63). Una fila por
 * cuenta y nodo con dos marcas: fijado (`fijado_en`) y abierto (`abierto_en`); sin ninguna, la fila no existe.
 *
 * - `usuario_id` es quien fija o abre, no el dueño del nodo: con 012 un cliente podrá fijar un nodo compartido. No es
 *   en cascada; las pruebas que borran cuentas borran antes `acceso_rapido`.
 * - Dos FK con `CHECK` de exactamente una (ADR-0011), no un `nodo_id` polimórfico. `ON DELETE CASCADE`: cuando
 *   `TrashPurger` borra el `archivo` o la `carpeta`, sus filas se van con él. Eliminar a la papelera es un `UPDATE`, así
 *   que las marcas siguen al restaurar.
 * - Las unicidades empiezan por la FK, así que también sirven al `CASCADE`; con `NULLS DISTINCT` no chocan entre tipos.
 * - RLS como `archivo_cliente`: solo el cliente dueño de la fila. Sin política para roles internos ni de mantenimiento.
 */
export class CrearAccesoRapido20261003100000 implements MigrationInterface {
  name = 'CrearAccesoRapido20261003100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE acceso_rapido (
        id             uuid        PRIMARY KEY,
        usuario_id     uuid        NOT NULL REFERENCES usuario(id),
        archivo_id     uuid        REFERENCES archivo(id) ON DELETE CASCADE,
        carpeta_id     uuid        REFERENCES carpeta(id) ON DELETE CASCADE,
        fijado_en      timestamptz,
        abierto_en     timestamptz,
        creado_en      timestamptz NOT NULL,
        actualizado_en timestamptz NOT NULL,
        CONSTRAINT ck_acceso_un_nodo CHECK ((archivo_id IS NULL) <> (carpeta_id IS NULL)),
        CONSTRAINT ck_acceso_util CHECK (fijado_en IS NOT NULL OR abierto_en IS NOT NULL),
        CONSTRAINT uq_acceso_archivo UNIQUE (archivo_id, usuario_id),
        CONSTRAINT uq_acceso_carpeta UNIQUE (carpeta_id, usuario_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_acceso_fijados ON acceso_rapido (usuario_id, fijado_en DESC, id DESC)
        WHERE fijado_en IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_acceso_recientes ON acceso_rapido (usuario_id, abierto_en DESC, id DESC)
        WHERE fijado_en IS NULL
    `);
    await queryRunner.query('ALTER TABLE acceso_rapido ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE acceso_rapido FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY acceso_rapido_cliente ON acceso_rapido TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY acceso_rapido_cliente ON acceso_rapido');
    await queryRunner.query('DROP TABLE acceso_rapido');
  }
}
