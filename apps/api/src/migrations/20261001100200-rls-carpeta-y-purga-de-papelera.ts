import type { MigrationInterface, QueryRunner } from 'typeorm';

const FUNCTION_SIGNATURE = 'papelera_vencida(timestamptz, integer)';

/**
 * RLS de `carpeta` y purga de la papelera sin actor (spec 006 CA-19, CA-22; plan §3; ADR-0005, ADR-0021; DF-52).
 * `carpeta` sigue a `archivo` de 005: el cliente solo ve y escribe lo suyo, y Administrador y Soporte leen metadatos.
 *
 * `papelera_vencida` es el **único** acceso sin actor de la purga, con el patrón de `carga_expiradas`: `SECURITY
 * DEFINER` ejecuta como el dueño y, como `FORCE` también lo somete a RLS, las políticas `*_mantenimiento` se atan a
 * `CURRENT_USER` (el rol que migra) y solo dejan ver filas en la papelera. Devuelve `(tipo_nodo, id, propietario_id)` de
 * las raíces **vencidas** (el llamador no adelanta el reloj), sin nombres ni claves, como máximo 1000 filas.
 */
export class RlsCarpetaYPurgaDePapelera20261001100200 implements MigrationInterface {
  name = 'RlsCarpetaYPurgaDePapelera20261001100200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE carpeta ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE carpeta FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY carpeta_cliente ON carpeta TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
    `);
    await queryRunner.query(`
      CREATE POLICY carpeta_metadatos_internos ON carpeta FOR SELECT TO nimbo_app
        USING (nimbo_actor_role() IN ('ADMIN', 'SUPPORT'))
    `);
    await queryRunner.query(
      'CREATE POLICY archivo_mantenimiento ON archivo FOR SELECT TO CURRENT_USER USING (eliminado_en IS NOT NULL)',
    );
    await queryRunner.query(
      'CREATE POLICY carpeta_mantenimiento ON carpeta FOR SELECT TO CURRENT_USER USING (eliminado_en IS NOT NULL)',
    );
    await queryRunner.query(`
      CREATE FUNCTION papelera_vencida(p_ahora timestamptz, p_limite integer)
        RETURNS TABLE (tipo_nodo text, id uuid, propietario_id uuid)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$ SELECT v.tipo_nodo, v.id, v.propietario_id FROM (
             SELECT 'archivo'::text AS tipo_nodo, a.id, a.propietario_id, a.purgar_en FROM public.archivo a
              WHERE a.eliminado_en IS NOT NULL AND a.eliminado_con_carpeta_id IS NULL
                AND a.purgar_en <= LEAST(p_ahora, now())
             UNION ALL
             SELECT 'carpeta'::text, c.id, c.propietario_id, c.purgar_en FROM public.carpeta c
              WHERE c.eliminado_en IS NOT NULL AND c.eliminado_con_carpeta_id IS NULL
                AND c.purgar_en <= LEAST(p_ahora, now())
           ) v
           ORDER BY v.purgar_en LIMIT LEAST(GREATEST(p_limite, 0), 1000) $$
    `);
    await queryRunner.query(`REVOKE ALL ON FUNCTION ${FUNCTION_SIGNATURE} FROM PUBLIC`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE} TO nimbo_app`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${FUNCTION_SIGNATURE}`);
    await queryRunner.query('DROP POLICY carpeta_mantenimiento ON carpeta');
    await queryRunner.query('DROP POLICY archivo_mantenimiento ON archivo');
    await queryRunner.query('DROP POLICY carpeta_metadatos_internos ON carpeta');
    await queryRunner.query('DROP POLICY carpeta_cliente ON carpeta');
    await queryRunner.query('ALTER TABLE carpeta NO FORCE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE carpeta DISABLE ROW LEVEL SECURITY');
  }
}
