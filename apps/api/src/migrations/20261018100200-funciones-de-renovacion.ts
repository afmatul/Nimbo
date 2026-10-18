import type { MigrationInterface, QueryRunner } from 'typeorm';

const TO_RENEW = 'suscripciones_por_renovar(integer)';
const TO_REMIND = 'suscripciones_por_avisar(integer, integer)';

/**
 * La pasada de renovación del `worker` (spec 010 plan §3; ADR-0021). Dos funciones sin actor, de solo lectura, con
 * `search_path` cerrado, `EXECUTE` solo para `nimbo_app`, solo ids y tope de 1000; fallan si hay un actor en la sesión:
 *
 * - `suscripciones_por_renovar`: de pago con `vence_en` cumplido, vigentes o en solo lectura **sin** el correo de
 *   vencida de ese `vence_en` (a esas el renovador solo les reenvía el correo, nunca cobra: M-3, RN-10).
 * - `suscripciones_por_avisar`: de pago y vigentes que vencen dentro de `p_dias` (1 a 7, RN-8) sin el aviso previo de
 *   ese `vence_en` (CA-5).
 *
 * Como `FORCE` somete también al dueño, `suscripcion_mantenimiento` le deja leer las filas de pago sin actor.
 */
export class FuncionesDeRenovacion20261018100200 implements MigrationInterface {
  name = 'FuncionesDeRenovacion20261018100200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE POLICY suscripcion_mantenimiento ON suscripcion FOR SELECT TO CURRENT_USER
        USING (nimbo_actor_id() IS NULL AND vence_en IS NOT NULL)
    `);
    await this.createToRenew(queryRunner);
    await this.createToRemind(queryRunner);
    for (const signature of [TO_RENEW, TO_REMIND]) {
      await queryRunner.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${signature} TO nimbo_app`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${TO_REMIND}`);
    await queryRunner.query(`DROP FUNCTION ${TO_RENEW}`);
    await queryRunner.query('DROP POLICY suscripcion_mantenimiento ON suscripcion');
  }

  private async createToRenew(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION suscripciones_por_renovar(p_limite integer)
        RETURNS TABLE (usuario_id uuid)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$
        BEGIN
          IF public.nimbo_actor_id() IS NOT NULL THEN
            RAISE EXCEPTION 'suscripciones_por_renovar solo corre sin actor' USING ERRCODE = 'insufficient_privilege';
          END IF;
          RETURN QUERY
            SELECT s.usuario_id FROM public.suscripcion s
             WHERE s.vence_en IS NOT NULL AND s.vence_en <= now()
               AND (s.estado = 'vigente' OR s.aviso_vencida_para IS DISTINCT FROM s.vence_en)
             ORDER BY s.vence_en LIMIT LEAST(GREATEST(p_limite, 0), 1000);
        END
        $$
    `);
  }

  private async createToRemind(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION suscripciones_por_avisar(p_dias integer, p_limite integer)
        RETURNS TABLE (usuario_id uuid)
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$
        BEGIN
          IF public.nimbo_actor_id() IS NOT NULL THEN
            RAISE EXCEPTION 'suscripciones_por_avisar solo corre sin actor' USING ERRCODE = 'insufficient_privilege';
          END IF;
          RETURN QUERY
            SELECT s.usuario_id FROM public.suscripcion s
             WHERE s.estado = 'vigente' AND s.vence_en > now()
               AND s.vence_en <= now() + make_interval(days => LEAST(GREATEST(p_dias, 1), 7))
               AND s.aviso_previo_para IS DISTINCT FROM s.vence_en
             ORDER BY s.vence_en LIMIT LEAST(GREATEST(p_limite, 0), 1000);
        END
        $$
    `);
  }
}
