import type { MigrationInterface, QueryRunner } from 'typeorm';

const RESTORE = 'restaurar_raiz_papelera(uuid, text, uuid, integer)';
const IS_SUPPORT = "nimbo_actor_role() = 'SUPPORT'";
/** Políticas del dueño (`TO CURRENT_USER`): solo las usa la función; `nimbo_app` no gana `UPDATE` (plan §5). */
const POLICIES = [
  ['archivo_soporte_restauracion', 'archivo', 'UPDATE', 'eliminado_en IS NOT NULL'],
  ['carpeta_soporte_restauracion', 'carpeta', 'UPDATE', 'eliminado_en IS NOT NULL'],
  ['carpeta_soporte_destino', 'carpeta', 'SELECT', 'eliminado_en IS NULL'],
  ['archivo_soporte_destino', 'archivo', 'SELECT', 'eliminado_en IS NULL'],
] as const;

/** Raíz de la papelera de `p_usuario` con retención vigente: la purga (`papelera_vencida`) no la alcanza todavía. */
const ROOT_IN_FORCE = (alias: string): string => `${alias}.id = p_nodo
  AND ${alias}.propietario_id = p_usuario AND ${alias}.eliminado_en IS NOT NULL
  AND ${alias}.eliminado_con_carpeta_id IS NULL AND ${alias}.purgar_en > now()`;

/** Un hermano vivo de `p_usuario` en el destino ya usa `v_final` (sin distinguir mayúsculas, como `uq_*_hermanos_nombre`). */
const TAKEN = (
  table: string,
  parentColumn: string,
): string => `EXISTS (SELECT 1 FROM public.${table} x
  WHERE x.propietario_id = p_usuario AND x.${parentColumn} IS NOT DISTINCT FROM v_padre
    AND x.eliminado_en IS NULL AND lower(x.nombre) = lower(v_final))`;

/**
 * Regla de 005 CA-6 y 006 CA-14 (`node-name.ts`): el nombre si está libre; si no, «base (n)cola» con el primer `n`
 * libre, la base recortada a 255 puntos de código y sin espacios al final. La cola es la extensión del archivo (el
 * último punto que no es el primero ni el último carácter); una carpeta no tiene. La prueba de equivalencia de
 * `support-trash.int-spec.ts` la compara con `FileName`/`FolderName.firstFree`.
 */
const FREE_NAME = `
  v_punto := char_length(v_nombre) + 1 - strpos(reverse(v_nombre), '.');
  IF p_tipo = 'file' AND strpos(reverse(v_nombre), '.') > 0 AND v_punto > 1 AND v_punto < char_length(v_nombre) THEN
    v_base := left(v_nombre, v_punto - 1);
    v_cola := substr(v_nombre, v_punto);
  ELSE
    v_base := v_nombre;
    v_cola := '';
  END IF;
  v_final := v_nombre;
  WHILE (p_tipo = 'file' AND ${TAKEN('archivo', 'carpeta_id')})
     OR (p_tipo = 'folder' AND ${TAKEN('carpeta', 'carpeta_padre_id')}) LOOP
    v_n := v_n + 1;
    v_sufijo := ' (' || v_n || ')' || v_cola;
    v_final := regexp_replace(left(v_base, 255 - char_length(v_sufijo)), '[[:space:]]+$', '') || v_sufijo;
  END LOOP;`;

/** Una sola raíz vuelve (ADR-0035 §5): otro conteo es un invariante roto, no un fallo esperado. */
const EXPECT_ONE_ROW = `
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'restaurar_raiz_papelera restauró % raíces', v_filas USING ERRCODE = 'cardinality_violation';
  END IF;`;

/**
 * La carpeta y lo que arrastró (006 CA-13). Primero reubica `ruta` y `profundidad` de todo su subárbol **mientras
 * sigue en la papelera** (la política solo deja actualizar filas eliminadas), y después saca solo lo arrastrado.
 */
const RESTORE_FOLDER = `
  v_ruta_nueva := v_ruta_destino || p_nodo::text || '/';
  IF v_ruta_nueva <> v_ruta THEN
    UPDATE public.carpeta c SET ruta = v_ruta_nueva || substr(c.ruta, char_length(v_ruta) + 1),
           profundidad = c.profundidad + v_profundidad_destino + 1 - v_profundidad
     WHERE c.propietario_id = p_usuario AND c.eliminado_en IS NOT NULL AND c.ruta LIKE v_ruta || '%';
  END IF;
  UPDATE public.archivo a SET eliminado_en = NULL, purgar_en = NULL, eliminado_con_carpeta_id = NULL
   WHERE a.propietario_id = p_usuario AND a.eliminado_con_carpeta_id = p_nodo;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  v_elementos := v_elementos + v_filas;
  UPDATE public.carpeta c SET eliminado_en = NULL, purgar_en = NULL, eliminado_con_carpeta_id = NULL
   WHERE c.propietario_id = p_usuario AND c.eliminado_con_carpeta_id = p_nodo;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  v_elementos := v_elementos + v_filas;
  UPDATE public.carpeta c SET eliminado_en = NULL, purgar_en = NULL, carpeta_padre_id = v_padre, nombre = v_final,
         actualizado_en = now()
   WHERE ${ROOT_IN_FORCE('c')};
  ${EXPECT_ONE_ROW}`;

const RESTORE_FILE = `
  UPDATE public.archivo a SET eliminado_en = NULL, purgar_en = NULL, carpeta_id = v_padre, nombre = v_final,
         actualizado_en = now()
   WHERE ${ROOT_IN_FORCE('a')};
  ${EXPECT_ONE_ROW}`;

/**
 * Lee la raíz bloqueada; 0 filas si no es del cliente, no es raíz, venció o el tipo no es `file`/`folder`. El tamaño
 * es `tamano_bytes` (la versión actual, la misma que ve Soporte en la 011): ni Soporte ni el dueño leen `version_archivo`.
 */
const LOCK_ROOT = `
  PERFORM 1 FROM public.usuario u WHERE u.id = p_usuario AND u.rol = 'CLIENT' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p_tipo = 'file' THEN
    SELECT a.carpeta_id, a.nombre, a.tamano_bytes INTO v_padre, v_nombre, v_bytes
      FROM public.archivo a WHERE ${ROOT_IN_FORCE('a')} FOR UPDATE;
  ELSIF p_tipo = 'folder' THEN
    SELECT c.carpeta_padre_id, c.nombre, c.ruta, c.profundidad INTO v_padre, v_nombre, v_ruta, v_profundidad
      FROM public.carpeta c WHERE ${ROOT_IN_FORCE('c')} FOR UPDATE;
    SELECT COALESCE(SUM(h.tamano_bytes), 0) INTO v_bytes FROM public.archivo h
     WHERE h.propietario_id = p_usuario AND h.eliminado_con_carpeta_id = p_nodo;
  END IF;
  IF v_nombre IS NULL THEN
    RETURN;
  END IF;`;

/** 006 CA-15: su carpeta si sigue viva; si no, la raíz (`moved_to_root` solo si tenía una carpeta que ya no está). */
const PLACE = `
  IF v_padre IS NOT NULL THEN
    SELECT c.ruta, c.profundidad INTO v_ruta_destino, v_profundidad_destino FROM public.carpeta c
     WHERE c.id = v_padre AND c.propietario_id = p_usuario AND c.eliminado_en IS NULL;
    IF NOT FOUND THEN
      v_padre := NULL;
      v_a_raiz := true;
    END IF;
  END IF;
  v_ruta_destino := COALESCE(v_ruta_destino, '/');
  v_profundidad_destino := COALESCE(v_profundidad_destino, 0);`;

/** 006 CA-15: la carpeta más honda que volvería con ella no puede pasar de `p_max_profundidad` (`FOLDER_MAX_DEPTH`). */
const CHECK_DEPTH = `
  IF p_tipo = 'folder' THEN
    SELECT COALESCE(MAX(h.profundidad), v_profundidad) INTO v_mas_honda FROM public.carpeta h
     WHERE h.propietario_id = p_usuario AND h.eliminado_con_carpeta_id = p_nodo;
    IF v_profundidad_destino + GREATEST(v_mas_honda, v_profundidad) - v_profundidad + 1 > p_max_profundidad THEN
      RETURN QUERY SELECT 'depth_exceeded'::text, v_nombre, 0, 0::bigint;
      RETURN;
    END IF;
  END IF;`;

/**
 * Soporte restaura una raíz de la papelera de un cliente (spec 011b CA-11, plan §3, ADR-0035). Devuelve
 * `restored`, `renamed`, `moved_to_root` o `depth_exceeded` con el nombre original, cuántos nodos volvieron y sus bytes.
 * Bloquea `usuario` antes que la raíz, como la 006, así no se cruza con la purga ni con el cliente.
 */
const RESTORE_SQL = `
  CREATE FUNCTION restaurar_raiz_papelera(p_usuario uuid, p_tipo text, p_nodo uuid, p_max_profundidad integer)
    RETURNS TABLE (resultado text, nombre_original text, elementos integer, bytes bigint)
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  #variable_conflict use_column
  DECLARE
    v_padre uuid;
    v_nombre text;
    v_ruta text;
    v_profundidad integer;
    v_bytes bigint;
    v_ruta_destino text;
    v_profundidad_destino integer;
    v_a_raiz boolean := false;
    v_mas_honda integer;
    v_punto integer;
    v_base text;
    v_cola text;
    v_sufijo text;
    v_final text;
    v_n integer := 0;
    v_ruta_nueva text;
    v_elementos integer := 1;
    v_filas integer;
  BEGIN
    IF public.nimbo_actor_role() IS DISTINCT FROM 'SUPPORT' THEN
      RAISE EXCEPTION 'restaurar_raiz_papelera solo la usa Soporte' USING ERRCODE = 'insufficient_privilege';
    END IF;
    ${LOCK_ROOT}
    ${PLACE}
    ${CHECK_DEPTH}
    ${FREE_NAME}
    IF p_tipo = 'folder' THEN
      ${RESTORE_FOLDER}
    ELSE
      ${RESTORE_FILE}
    END IF;
    RETURN QUERY SELECT CASE WHEN v_a_raiz THEN 'moved_to_root' WHEN v_final <> v_nombre THEN 'renamed'
                             ELSE 'restored' END, v_nombre, v_elementos, v_bytes;
  END
  $$`;

/**
 * Restauración de la papelera de un cliente por Soporte (spec 011b plan §3, ADR-0035; DF-81). Sin políticas de
 * escritura para `nimbo_app`: cuatro políticas del dueño, que solo usa `restaurar_raiz_papelera`, dejan leer el destino
 * vivo y escribir filas que siguen en la papelera. El `SELECT` de filas eliminadas ya lo dan `*_mantenimiento` (006).
 * No hay `INSERT`, `DELETE` ni acceso a `version_archivo` o `carga`.
 */
export class SoporteRestauraLaPapelera20261026100100 implements MigrationInterface {
  name = 'SoporteRestauraLaPapelera20261026100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [policy, table, command, rows] of POLICIES) {
      const check = command === 'UPDATE' ? ` WITH CHECK (${IS_SUPPORT})` : '';
      await queryRunner.query(
        `CREATE POLICY ${policy} ON ${table} FOR ${command} TO CURRENT_USER USING (${IS_SUPPORT} AND ${rows})${check}`,
      );
    }
    await queryRunner.query(RESTORE_SQL);
    await queryRunner.query(`REVOKE ALL ON FUNCTION ${RESTORE} FROM PUBLIC`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${RESTORE} TO nimbo_app`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${RESTORE}`);
    for (const [policy, table] of POLICIES) {
      await queryRunner.query(`DROP POLICY ${policy} ON ${table}`);
    }
  }
}
