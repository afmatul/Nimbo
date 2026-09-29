import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lectura del actor en SQL (spec 003 CA-12, plan §4 (c), DT-6): la única definición de «actor sin fijar = NULL» del
 * lado de la base, para las políticas RLS de 005, 012 y 019. `withActor` fija `app.actor_id` y `app.actor_role` con
 * `set_config(…, true)` (locales a la transacción) y valida antes que el id sea un UUID, así el `::uuid` no falla
 * dentro de una política. `SECURITY INVOKER`: leen la configuración de la sesión de quien consulta.
 */
export class CrearFuncionesDeActor20260928110100 implements MigrationInterface {
  name = 'CrearFuncionesDeActor20260928110100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION nimbo_actor_id() RETURNS uuid
        LANGUAGE sql STABLE SECURITY INVOKER
        AS $$ SELECT nullif(current_setting('app.actor_id', true), '')::uuid $$
    `);
    await queryRunner.query(`
      CREATE FUNCTION nimbo_actor_role() RETURNS text
        LANGUAGE sql STABLE SECURITY INVOKER
        AS $$ SELECT nullif(current_setting('app.actor_role', true), '') $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION nimbo_actor_role()');
    await queryRunner.query('DROP FUNCTION nimbo_actor_id()');
  }
}
