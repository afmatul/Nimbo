import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['archivo', 'version_archivo', 'carga'] as const;

/**
 * RLS de `archivo`, `version_archivo` y `carga` (spec 005 CA-16, CA-17; plan §4; ADR-0005, ADR-0021; DF-52 opción B).
 * Usa `nimbo_actor_id()` y `nimbo_actor_role()` de 003. El cliente solo ve y escribe lo suyo; Administrador y Soporte
 * leen metadatos de `archivo` y ningún rol interno recibe filas de `version_archivo` (con su clave de objeto).
 *
 * `carga_expiradas` es el **único** acceso sin actor: `SECURITY DEFINER` ejecuta como el dueño, y como `FORCE` también
 * lo somete a RLS, `carga_mantenimiento` se ata a `CURRENT_USER` (el rol que migra). Solo devuelve `(id, propietario_id)`
 * de cargas activas **vencidas** (el llamador no puede adelantar el reloj) y como máximo 1000 filas. Todas las
 * migraciones deben correr con el mismo rol dueño: cambiarlo exige una migración nueva.
 */
export class PoliticasRlsArchivoVersionCarga20260930100300 implements MigrationInterface {
  name = 'PoliticasRlsArchivoVersionCarga20260930100300';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
    await queryRunner.query(`
      CREATE POLICY archivo_cliente ON archivo TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
    `);
    await queryRunner.query(`
      CREATE POLICY archivo_metadatos_internos ON archivo FOR SELECT TO nimbo_app
        USING (nimbo_actor_role() IN ('ADMIN', 'SUPPORT'))
    `);
    await queryRunner.query(`
      CREATE POLICY version_archivo_cliente ON version_archivo TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = version_archivo.archivo_id))
        WITH CHECK (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = version_archivo.archivo_id))
    `);
    await queryRunner.query(`
      CREATE POLICY carga_cliente ON carga TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
    `);
    await queryRunner.query(
      "CREATE POLICY carga_mantenimiento ON carga FOR SELECT TO CURRENT_USER USING (estado = 'activa')",
    );
    await queryRunner.query(`
      CREATE FUNCTION carga_expiradas(p_ahora timestamptz, p_limite integer)
        RETURNS TABLE (id uuid, propietario_id uuid)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$ SELECT c.id, c.propietario_id FROM public.carga c
           WHERE c.estado = 'activa' AND c.expira_en <= LEAST(p_ahora, now())
           ORDER BY c.expira_en LIMIT LEAST(GREATEST(p_limite, 0), 1000) $$
    `);
    await queryRunner.query(
      'REVOKE ALL ON FUNCTION carga_expiradas(timestamptz, integer) FROM PUBLIC',
    );
    await queryRunner.query(
      'GRANT EXECUTE ON FUNCTION carga_expiradas(timestamptz, integer) TO nimbo_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION carga_expiradas(timestamptz, integer)');
    await queryRunner.query('DROP POLICY carga_mantenimiento ON carga');
    await queryRunner.query('DROP POLICY carga_cliente ON carga');
    await queryRunner.query('DROP POLICY version_archivo_cliente ON version_archivo');
    await queryRunner.query('DROP POLICY archivo_metadatos_internos ON archivo');
    await queryRunner.query('DROP POLICY archivo_cliente ON archivo');
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
  }
}
