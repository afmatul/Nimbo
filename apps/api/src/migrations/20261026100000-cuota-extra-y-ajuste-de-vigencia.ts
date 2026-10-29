import type { MigrationInterface, QueryRunner } from 'typeorm';

const LIMITS = 'limites_de_cuenta(uuid)';
const ADJUST_QUOTA = 'ajustar_cuota_extra(uuid, bigint, timestamptz)';
const EXTEND_VALIDITY = 'extender_vigencia(uuid, timestamptz)';
const IS_OWNER = "nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id()";
const WITHOUT_EXTRA = 'cuota_extra_bytes = 0 AND cuota_extra_hasta IS NULL';
/** Tope técnico de `plan + extra` (spec RN-1, RN-8): 2^53-1, el mayor entero exacto de un `number` de los contratos. */
const MAX_BYTES = '9007199254740991';
/** El día de Guatemala que cierra una vigencia (RN-8). Sin horario de verano: su medianoche son siempre las 06:00 UTC. */
const TIME_ZONE = "'America/Guatemala'";

/** Encabezado común: `plpgsql`, `SECURITY DEFINER` y `search_path` cerrado (ADR-0035 §1). */
const definer = (volatility: 'STABLE' | 'VOLATILE'): string => `
  LANGUAGE plpgsql ${volatility} SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS`;

/** La vista de límites de una cuenta, igual en las tres funciones; el extra cuenta solo mientras `now() < hasta`. */
const VIEW_COLUMNS = `plan_slug text, plan_nombre text, cuota_plan bigint, estado text, vence_en timestamptz,
  extra bigint, hasta timestamptz, espacio_usado bigint, cuota_total bigint`;
const EXTRA_IN_FORCE = 'CASE WHEN s.cuota_extra_hasta > now() THEN s.cuota_extra_bytes ELSE 0 END';
const VIEW_VALUES = `p.slug::text, p.nombre::text, p.cuota_bytes, s.estado::text, s.vence_en, ${EXTRA_IN_FORCE},
  CASE WHEN s.cuota_extra_hasta > now() THEN s.cuota_extra_hasta END, u.espacio_usado,
  p.cuota_bytes + ${EXTRA_IN_FORCE}`;
const VIEW_FROM = `FROM public.suscripcion s JOIN public.plan p ON p.id = s.plan_id
  JOIN public.usuario u ON u.id = s.usuario_id WHERE s.usuario_id = p_usuario`;
const VIEW_SELECT = `${VIEW_VALUES} ${VIEW_FROM}`;
const NO_VIEW =
  'NULL::text, NULL::text, NULL::bigint, NULL::text, NULL::timestamptz, NULL::bigint, NULL::timestamptz, NULL::bigint, NULL::bigint';

/** Solo el Administrador ejecuta las tres (ADR-0035 §1); otro rol o una sesión sin actor es `42501`. */
const REQUIRE_ADMIN = (name: string): string => `
  IF public.nimbo_actor_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION '${name} solo la usa un administrador' USING ERRCODE = 'insufficient_privilege';
  END IF;`;

/**
 * Bloquea primero `usuario` (solo clientes) y después su `suscripcion`; sin una de las dos, devuelve el código con
 * `noView`, la fila vacía de la función.
 */
const LOCK_ACCOUNT = (subscriptionInto: string, noView: string): string => `
  PERFORM 1 FROM public.usuario u WHERE u.id = p_usuario AND u.rol = 'CLIENT' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'account_not_found'::text, ${noView};
    RETURN;
  END IF;
  SELECT ${subscriptionInto} FROM public.suscripcion s JOIN public.plan p ON p.id = s.plan_id
   JOIN public.usuario u ON u.id = s.usuario_id WHERE s.usuario_id = p_usuario FOR UPDATE OF s;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_subscription'::text, ${noView};
    RETURN;
  END IF;`;

/** Una fila por `usuario_id` (ADR-0035 §5): un conteo distinto es un invariante roto, no un fallo esperado. */
const EXPECT_ONE_ROW = (name: string): string => `
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION '${name} actualizó % filas de suscripcion', v_filas USING ERRCODE = 'cardinality_violation';
  END IF;`;

/** Solo cuentas de cliente, como las de escritura (`LOCK_ACCOUNT`): una interna da 0 filas aunque tenga suscripción. */
const LIMITS_SQL = `
  CREATE FUNCTION limites_de_cuenta(p_usuario uuid) RETURNS TABLE (${VIEW_COLUMNS}) ${definer('STABLE')} $$
  #variable_conflict use_column
  BEGIN
    ${REQUIRE_ADMIN('limites_de_cuenta')}
    RETURN QUERY SELECT ${VIEW_SELECT} AND u.rol = 'CLIENT';
  END
  $$`;

/**
 * `PUT` pide `p_extra > 0` y `p_hasta > now()`; `DELETE` llama con `0`/`NULL`, la única forma de quitar (RN-1). La
 * suma se compara restando para que un `p_extra` enorme no desborde el `bigint`.
 */
const ADJUST_QUOTA_SQL = `
  CREATE FUNCTION ajustar_cuota_extra(p_usuario uuid, p_extra bigint, p_hasta timestamptz)
    RETURNS TABLE (codigo text, ${VIEW_COLUMNS}) ${definer('VOLATILE')} $$
  #variable_conflict use_column
  DECLARE
    v_cuota_plan bigint;
    v_usado bigint;
    v_codigo text := 'ok';
    v_filas integer;
  BEGIN
    ${REQUIRE_ADMIN('ajustar_cuota_extra')}
    ${LOCK_ACCOUNT('p.cuota_bytes, u.espacio_usado INTO v_cuota_plan, v_usado', NO_VIEW)}
    IF COALESCE((p_extra = 0 AND p_hasta IS NULL)
                OR (p_extra > 0 AND p_hasta > now() AND p_extra <= ${MAX_BYTES} - v_cuota_plan), false) IS FALSE THEN
      v_codigo := 'quota_invalid';
    ELSIF v_cuota_plan + p_extra < v_usado THEN
      v_codigo := 'quota_below_usage';
    ELSE
      UPDATE public.suscripcion s SET cuota_extra_bytes = p_extra, cuota_extra_hasta = p_hasta, actualizado_en = now()
       WHERE s.usuario_id = p_usuario;
      ${EXPECT_ONE_ROW('ajustar_cuota_extra')}
    END IF;
    RETURN QUERY SELECT v_codigo, ${VIEW_SELECT};
  END
  $$`;

/**
 * Solo extiende (RN-2): de pago, `p_vence > now()` y posterior a la medianoche de Guatemala que cierra el último día
 * que se muestra, el de `vence_en − 1 ms` (RN-8). Sale de solo lectura y no toca avisos, renovación ni cambio programado.
 * `salio_de_solo_lectura` dice si la cuenta estaba en solo lectura y salió, para el evento de la 010 sin otra lectura.
 */
const EXTEND_VALIDITY_SQL = `
  CREATE FUNCTION extender_vigencia(p_usuario uuid, p_vence timestamptz)
    RETURNS TABLE (codigo text, ${VIEW_COLUMNS}, salio_de_solo_lectura boolean) ${definer('VOLATILE')} $$
  #variable_conflict use_column
  DECLARE
    v_slug text;
    v_vence timestamptz;
    v_estado text;
    v_fin_del_ultimo_dia timestamptz;
    v_codigo text := 'ok';
    v_filas integer;
  BEGIN
    ${REQUIRE_ADMIN('extender_vigencia')}
    ${LOCK_ACCOUNT('p.slug, s.vence_en, s.estado::text INTO v_slug, v_vence, v_estado', `${NO_VIEW}, false`)}
    v_fin_del_ultimo_dia := (date_trunc('day', (v_vence - interval '1 millisecond') AT TIME ZONE ${TIME_ZONE})
                             + interval '1 day') AT TIME ZONE ${TIME_ZONE};
    IF v_slug = 'personal' THEN
      v_codigo := 'personal';
    ELSIF (p_vence > now() AND p_vence > v_fin_del_ultimo_dia) IS NOT TRUE THEN
      v_codigo := 'validity_not_extended';
    ELSE
      UPDATE public.suscripcion s SET vence_en = p_vence, estado = 'vigente', actualizado_en = now()
       WHERE s.usuario_id = p_usuario;
      ${EXPECT_ONE_ROW('extender_vigencia')}
    END IF;
    RETURN QUERY SELECT v_codigo, ${VIEW_VALUES}, (v_codigo = 'ok' AND v_estado = 'solo_lectura') ${VIEW_FROM};
  END
  $$`;

/**
 * Cuota extra y ajuste de vigencia del Administrador (spec 011b plan §3, ADR-0035 §1; DF-26). `suscripcion` gana un
 * único extra con su fecha de fin; el vencimiento se evalúa al leer, sin job (RN-1).
 *
 * - `nimbo_app` no gana `UPDATE` de las columnas nuevas y su alta exige el extra vacío: el cliente no se sube la cuota.
 * - Tres funciones `SECURITY DEFINER` con el rol `ADMIN` comprobado dentro: `limites_de_cuenta` (`STABLE`, lee por
 *   `suscripcion_administracion`; 0 filas = sin suscripción o cuenta interna) y las de escritura `ajustar_cuota_extra` y
 *   `extender_vigencia` (`VOLATILE`), que devuelven un código de resultado y la vista; la de vigencia, también
 *   `salio_de_solo_lectura`.
 * - `suscripcion_ajuste_administracion` (`TO CURRENT_USER`) deja al dueño bloquear y escribir bajo `FORCE` RLS; solo
 *   la usan las funciones.
 */
export class CuotaExtraYAjusteDeVigencia20261026100000 implements MigrationInterface {
  name = 'CuotaExtraYAjusteDeVigencia20261026100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE suscripcion
        ADD COLUMN cuota_extra_bytes bigint NOT NULL DEFAULT 0,
        ADD COLUMN cuota_extra_hasta timestamptz,
        ADD CONSTRAINT ck_suscripcion_cuota_extra CHECK (
          cuota_extra_bytes >= 0 AND cuota_extra_bytes <= ${MAX_BYTES}
          AND ((cuota_extra_bytes = 0) = (cuota_extra_hasta IS NULL)))
    `);
    await this.replaceClientInsert(queryRunner, `${IS_OWNER} AND ${WITHOUT_EXTRA}`);
    await queryRunner.query(`
      CREATE POLICY suscripcion_ajuste_administracion ON suscripcion FOR UPDATE TO CURRENT_USER
        USING (nimbo_actor_role() = 'ADMIN') WITH CHECK (nimbo_actor_role() = 'ADMIN')
    `);
    for (const sql of [LIMITS_SQL, ADJUST_QUOTA_SQL, EXTEND_VALIDITY_SQL]) {
      await queryRunner.query(sql);
    }
    for (const signature of [LIMITS, ADJUST_QUOTA, EXTEND_VALIDITY]) {
      await queryRunner.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${signature} TO nimbo_app`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const signature of [EXTEND_VALIDITY, ADJUST_QUOTA, LIMITS]) {
      await queryRunner.query(`DROP FUNCTION ${signature}`);
    }
    await queryRunner.query('DROP POLICY suscripcion_ajuste_administracion ON suscripcion');
    await this.replaceClientInsert(queryRunner, IS_OWNER);
    await queryRunner.query(`
      ALTER TABLE suscripcion
        DROP CONSTRAINT ck_suscripcion_cuota_extra,
        DROP COLUMN cuota_extra_hasta,
        DROP COLUMN cuota_extra_bytes
    `);
  }

  /** Rehace el alta del cliente de la 009 con `check` (plan §3). */
  private async replaceClientInsert(queryRunner: QueryRunner, check: string): Promise<void> {
    await queryRunner.query('DROP POLICY suscripcion_cliente_alta ON suscripcion');
    await queryRunner.query(
      `CREATE POLICY suscripcion_cliente_alta ON suscripcion FOR INSERT TO nimbo_app WITH CHECK (${check})`,
    );
  }
}
