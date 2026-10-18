import type { MigrationInterface, QueryRunner } from 'typeorm';

const PLAN_NAMES = 'nombres_de_plan_por_cliente(uuid[])';
const CLIENT_COUNTS = 'conteo_de_clientes_por_plan()';

/**
 * Lecturas de `suscripcion` para la administración (spec 009 T-03, PD-80; ADR-0021; acuerdo con la 011). La RLS de la
 * tabla solo deja al cliente su propia fila; estas dos funciones `SECURITY DEFINER` son la única lectura de los roles
 * internos, de solo lectura, con `search_path` cerrado, `EXECUTE` solo para `nimbo_app` y el rol comprobado dentro:
 *
 * - `nombres_de_plan_por_cliente`: solo `ADMIN` (011 CA-1), hasta 100 ids; un cliente sin fila no aparece («—»).
 * - `conteo_de_clientes_por_plan`: `ADMIN` y `OPERATOR` (011 CA-8, CA-12); solo planes con al menos una fila.
 *
 * `Soporte` no ejecuta ninguna (spec §5). Como `FORCE` somete también al dueño, `suscripcion_administracion` le deja
 * leer solo con un actor `ADMIN` u `OPERATOR` en la sesión. Ambas ignoran `vence_en` hasta la 010.
 */
export class FuncionesDeLecturaDeSuscripcion20261015110000 implements MigrationInterface {
  name = 'FuncionesDeLecturaDeSuscripcion20261015110000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE POLICY suscripcion_administracion ON suscripcion FOR SELECT TO CURRENT_USER
        USING (nimbo_actor_role() IN ('ADMIN', 'OPERATOR'))
    `);
    await this.createPlanNames(queryRunner);
    await this.createClientCounts(queryRunner);
    for (const signature of [PLAN_NAMES, CLIENT_COUNTS]) {
      await queryRunner.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${signature} TO nimbo_app`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${CLIENT_COUNTS}`);
    await queryRunner.query(`DROP FUNCTION ${PLAN_NAMES}`);
    await queryRunner.query('DROP POLICY suscripcion_administracion ON suscripcion');
  }

  private async createPlanNames(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION nombres_de_plan_por_cliente(p_clientes uuid[])
        RETURNS TABLE (usuario_id uuid, plan text)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$
        BEGIN
          IF public.nimbo_actor_role() IS DISTINCT FROM 'ADMIN' THEN
            RAISE EXCEPTION 'nombres_de_plan_por_cliente solo la usa un administrador' USING ERRCODE = 'insufficient_privilege';
          END IF;
          IF cardinality(p_clientes) > 100 THEN
            RAISE EXCEPTION 'nombres_de_plan_por_cliente acepta hasta 100 clientes' USING ERRCODE = 'invalid_parameter_value';
          END IF;
          RETURN QUERY
            SELECT s.usuario_id, p.nombre::text FROM public.suscripcion s JOIN public.plan p ON p.id = s.plan_id
             WHERE s.usuario_id = ANY (p_clientes);
        END
        $$
    `);
  }

  private async createClientCounts(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION conteo_de_clientes_por_plan()
        RETURNS TABLE (plan_id uuid, clientes integer)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$
        BEGIN
          IF public.nimbo_actor_role() IS NULL OR public.nimbo_actor_role() NOT IN ('ADMIN', 'OPERATOR') THEN
            RAISE EXCEPTION 'conteo_de_clientes_por_plan solo lo usan administración y operación' USING ERRCODE = 'insufficient_privilege';
          END IF;
          RETURN QUERY
            SELECT s.plan_id, count(*)::integer FROM public.suscripcion s GROUP BY s.plan_id ORDER BY s.plan_id;
        END
        $$
    `);
  }
}
