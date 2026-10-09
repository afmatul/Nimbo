import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría de las acciones internas (spec 011 CA-7, CA-16; plan §3; DF-65). Amplía `evento_auditoria` de 004:
 *
 * - `usuario_afectado_id` admite `NULL`, pero **solo** en los cambios de catálogo (recurso `plan`) y en el alta inicial
 *   (`account.bootstrap_admin`): `ck_evento_destino` lo exige en ambos sentidos, sin hueco por `NULL`. Ninguna
 *   política de lectura alcanza esos eventos, así que «Mi actividad» nunca muestra un actor de sistema.
 * - `rol_actor` suma `SYSTEM` (el comando de alta inicial), siempre sin `actor_id` (`ck_evento_sistema`), y
 *   `tipo_recurso` suma `account` y `plan`. Los CHECK de 004 se reemplazan por otros con nombre propio.
 * - `evento_auditoria_alta_sistema`: fuera de todo `withActor` (sin `app.actor_id`), `nimbo_app` solo puede insertar el
 *   evento del alta inicial; un `run` sin actor no inserta ningún otro evento `SYSTEM`.
 *
 * `down` borra lo que 004 no admite antes de restaurar sus CHECK y el `NOT NULL`. Con `FORCE` el dueño también queda
 * sometido a RLS y, sin política de `DELETE`, borraría 0 filas: se quita `FORCE` solo durante el borrado (como en 005).
 */
export class AmpliarEventoAuditoriaParaAccionesInternas20261007100300 implements MigrationInterface {
  name = 'AmpliarEventoAuditoriaParaAccionesInternas20261007100300';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE evento_auditoria ALTER COLUMN usuario_afectado_id DROP NOT NULL,
        DROP CONSTRAINT evento_auditoria_rol_actor_check,
        DROP CONSTRAINT evento_auditoria_tipo_recurso_check,
        ADD CONSTRAINT ck_evento_rol_actor CHECK (rol_actor IN ('CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR', 'SYSTEM')),
        ADD CONSTRAINT ck_evento_tipo_recurso CHECK (tipo_recurso IN ('file', 'folder', 'upload', 'account', 'plan')),
        ADD CONSTRAINT ck_evento_sistema CHECK (rol_actor <> 'SYSTEM' OR actor_id IS NULL),
        ADD CONSTRAINT ck_evento_destino CHECK ((usuario_afectado_id IS NULL)
          = (tipo_recurso IS NOT DISTINCT FROM 'plan' OR accion = 'account.bootstrap_admin'))
    `);
    await queryRunner.query(`
      CREATE POLICY evento_auditoria_alta_sistema ON evento_auditoria FOR INSERT TO nimbo_app
        WITH CHECK (nimbo_actor_id() IS NULL AND actor_id IS NULL AND rol_actor = 'SYSTEM'
                    AND accion = 'account.bootstrap_admin' AND tipo_recurso = 'account' AND recurso_id IS NOT NULL
                    AND usuario_afectado_id IS NULL)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE evento_auditoria NO FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      DELETE FROM evento_auditoria
       WHERE usuario_afectado_id IS NULL OR rol_actor = 'SYSTEM' OR tipo_recurso IN ('account', 'plan')
    `);
    await queryRunner.query('ALTER TABLE evento_auditoria FORCE ROW LEVEL SECURITY');
    await queryRunner.query('DROP POLICY evento_auditoria_alta_sistema ON evento_auditoria');
    await queryRunner.query(`
      ALTER TABLE evento_auditoria DROP CONSTRAINT ck_evento_destino,
        DROP CONSTRAINT ck_evento_sistema,
        DROP CONSTRAINT ck_evento_tipo_recurso,
        DROP CONSTRAINT ck_evento_rol_actor,
        ADD CONSTRAINT evento_auditoria_rol_actor_check
          CHECK (rol_actor IN ('CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR')),
        ADD CONSTRAINT evento_auditoria_tipo_recurso_check CHECK (tipo_recurso IN ('file', 'folder', 'upload')),
        ALTER COLUMN usuario_afectado_id SET NOT NULL
    `);
  }
}
