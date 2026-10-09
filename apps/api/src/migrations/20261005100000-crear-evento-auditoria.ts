import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de auditoría persistente (spec 004 D-7, D-9; plan §3; DF-12; ADR-0005). Una fila por operación sensible, de
 * solo adición (RN-2).
 *
 * - `accion` es texto: el catálogo vive en la aplicación y cada spec agrega acciones sin migrar (RN-3).
 * - `actor_id` es `ON DELETE SET NULL` (anonimización al eliminar la cuenta, D-8; `rol_actor` se conserva) y
 *   `usuario_afectado_id` es `ON DELETE CASCADE`. Las acciones referenciales las ejecuta el dueño de la tabla, así que
 *   el `REVOKE` no las estorba. `recurso_id` no tiene FK: el recurso puede haberse purgado (D-3).
 * - Un solo índice, el de la consulta del afectado con el teclado del cursor `(ocurrido_en, id)` (D-8).
 * - RLS: cada quien lee solo los eventos donde es el afectado, incluidos los roles internos (CA-12); se inserta solo a
 *   nombre propio y un `CLIENT` solo sobre su cuenta. Sin política de `UPDATE` ni `DELETE`.
 * - Solo adición con `REVOKE`, no con *trigger* (plan §3): los privilegios por defecto de 003 dan `UPDATE` y `DELETE`
 *   a `nimbo_app`; aquí se quitan, junto con `TRUNCATE`.
 */
export class CrearEventoAuditoria20261005100000 implements MigrationInterface {
  name = 'CrearEventoAuditoria20261005100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE evento_auditoria (
        id                  uuid        PRIMARY KEY,
        accion              text        NOT NULL,
        actor_id            uuid        REFERENCES usuario(id) ON DELETE SET NULL,
        rol_actor           text        NOT NULL CHECK (rol_actor IN ('CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR')),
        usuario_afectado_id uuid        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        tipo_recurso        text        CHECK (tipo_recurso IN ('file', 'folder', 'upload')),
        recurso_id          uuid,
        atributos           jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(atributos) = 'object'),
        ocurrido_en         timestamptz NOT NULL,
        correlation_id      text,
        CONSTRAINT ck_evento_recurso CHECK ((tipo_recurso IS NULL) = (recurso_id IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_evento_afectado_fecha
        ON evento_auditoria (usuario_afectado_id, ocurrido_en DESC, id DESC)
    `);
    await queryRunner.query('ALTER TABLE evento_auditoria ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE evento_auditoria FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY evento_auditoria_lectura ON evento_auditoria FOR SELECT TO nimbo_app
        USING (usuario_afectado_id = nimbo_actor_id())
    `);
    await queryRunner.query(`
      CREATE POLICY evento_auditoria_alta ON evento_auditoria FOR INSERT TO nimbo_app
        WITH CHECK (actor_id = nimbo_actor_id() AND rol_actor = nimbo_actor_role()
                    AND (usuario_afectado_id = nimbo_actor_id() OR nimbo_actor_role() <> 'CLIENT'))
    `);
    await queryRunner.query('REVOKE UPDATE, DELETE, TRUNCATE ON evento_auditoria FROM nimbo_app');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY evento_auditoria_alta ON evento_auditoria');
    await queryRunner.query('DROP POLICY evento_auditoria_lectura ON evento_auditoria');
    await queryRunner.query('DROP TABLE evento_auditoria');
  }
}
