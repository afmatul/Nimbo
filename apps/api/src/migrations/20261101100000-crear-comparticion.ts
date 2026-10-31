import type { MigrationInterface, QueryRunner } from 'typeorm';

const FUNCTION_SIGNATURE = 'nodos_compartidos()';

/** Condición de las políticas del destinatario: un cliente sobre las filas que lo nombran. */
const GRANTEE_OF_ROW = "nimbo_actor_role() = 'CLIENT' AND destinatario_id = nimbo_actor_id()";

/** Condición de lo que ve el dueño en `archivo`/`carpeta`: nodos vivos de quien compartió algo con el actor. */
const LIVE_NODE_OF_SHARER = (table: string): string => `
  eliminado_en IS NULL AND nimbo_actor_role() = 'CLIENT' AND EXISTS (
    SELECT 1 FROM comparticion c
     WHERE c.propietario_id = ${table}.propietario_id AND c.destinatario_id = nimbo_actor_id())`;

/** El nodo de la fila es del actor (`WITH CHECK` del propietario): nadie comparte lo ajeno a su nombre. */
const NODE_OWNED_BY_ACTOR = `
  (archivo_id IS NULL OR EXISTS (
     SELECT 1 FROM archivo a WHERE a.id = archivo_id AND a.propietario_id = nimbo_actor_id()))
  AND (carpeta_id IS NULL OR EXISTS (
     SELECT 1 FROM carpeta k WHERE k.id = carpeta_id AND k.propietario_id = nimbo_actor_id()))`;

/**
 * `nodos_compartidos()`: la regla única de «qué se comparte conmigo» (spec 012 CA-13, CA-17, CA-21; plan §3,
 * ADR-0005). Une los accesos directos del actor y el subárbol de cada carpeta compartida (prefijo de `ruta`, del
 * mismo propietario, también para los archivos de cada carpeta), solo nodos vivos de propietarios `activa`, con el
 * nivel mayor por nodo. Una fila cuyo nodo no es del `propietario_id` de la compartición no alcanza nada. Devuelve `tipo_nodo` `archivo` o `carpeta`.
 * El rango `~>=~`/`~<~` acota el prefijo para que `idx_carpeta_ruta` (`text_pattern_ops`) lo sirva en el bucle
 * anidado (un `LIKE` con patrón no constante no usa índice, R-3); `~` es mayor que todo carácter de una `ruta` (UUID y
 * «/») y el `LIKE` sigue siendo la condición exacta.
 */
const SHARED_NODES_BODY = `
  WITH directos AS (
    SELECT c.propietario_id, c.archivo_id, c.carpeta_id, c.nivel
      FROM public.comparticion c
      JOIN public.usuario u ON u.id = c.propietario_id AND u.estado = 'activa'
     WHERE public.nimbo_actor_role() = 'CLIENT' AND c.destinatario_id = public.nimbo_actor_id()
  ), carpetas AS (
    SELECT h.id, h.propietario_id, d.nivel
      FROM directos d
      JOIN public.carpeta r ON r.id = d.carpeta_id AND r.propietario_id = d.propietario_id
      JOIN public.carpeta h ON h.propietario_id = r.propietario_id
                           AND h.ruta ~>=~ r.ruta AND h.ruta ~<~ (r.ruta || '~')
                           AND h.ruta LIKE r.ruta || '%'
     WHERE h.eliminado_en IS NULL
  ), alcanzados AS (
    SELECT 'carpeta'::text AS tipo_nodo, k.id AS nodo_id, k.nivel FROM carpetas k
    UNION ALL
    SELECT 'archivo'::text, a.id, k.nivel
      FROM carpetas k
      JOIN public.archivo a ON a.carpeta_id = k.id AND a.propietario_id = k.propietario_id
     WHERE a.eliminado_en IS NULL
    UNION ALL
    SELECT 'archivo'::text, a.id, d.nivel
      FROM directos d
      JOIN public.archivo a ON a.id = d.archivo_id AND a.propietario_id = d.propietario_id
     WHERE a.eliminado_en IS NULL
  )
  SELECT nodo_id, tipo_nodo,
         CASE WHEN bool_or(nivel = 'EDITOR') THEN 'EDITOR' ELSE 'VIEWER' END::text AS nivel
    FROM alcanzados GROUP BY nodo_id, tipo_nodo`;

/**
 * Comparticiones con otro cliente (spec 012 CA-1, CA-2, CA-18, CA-21, CA-23; plan §3; ADR-0011, DF-31).
 *
 * - `comparticion`: un nodo (archivo **o** carpeta), nivel `VIEWER` o `EDITOR` (sin `OWNER`), nunca consigo mismo y a
 *   lo sumo una fila por nodo y destinatario. Cae en cascada con la purga definitiva del nodo (CA-18).
 * - RLS: el propietario lee y escribe las suyas (solo sobre nodos propios); el destinatario lee y borra (Salir, CA-23)
 *   las que lo nombran; los roles internos no tienen política.
 * - `nodos_compartidos()` sin parámetros: el actor sale de `nimbo_actor_id()`, así nadie consulta por otra cuenta.
 *   Sigue el patrón de `carga_expiradas`: `SECURITY DEFINER` ejecuta como el dueño y, como `FORCE` también lo somete a
 *   RLS, las políticas `*_nodos_compartidos` se atan a `CURRENT_USER` y solo le dejan ver las comparticiones del
 *   actor y los nodos vivos de quien le compartió algo. Lee `usuario.estado` (CA-17, DF-85).
 */
export class CrearComparticion20261101100000 implements MigrationInterface {
  name = 'CrearComparticion20261101100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createTable(queryRunner);
    await this.createAppPolicies(queryRunner);
    await this.createOwnerPolicies(queryRunner);
    await queryRunner.query(`
      CREATE FUNCTION ${FUNCTION_SIGNATURE}
        RETURNS TABLE (nodo_id uuid, tipo_nodo text, nivel text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$ ${SHARED_NODES_BODY} $$
    `);
    await queryRunner.query(`REVOKE ALL ON FUNCTION ${FUNCTION_SIGNATURE} FROM PUBLIC`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE} TO nimbo_app`);
  }

  /** La tabla se lleva sus índices y políticas; las del dueño en `archivo` y `carpeta` se borran aparte. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${FUNCTION_SIGNATURE}`);
    await queryRunner.query('DROP POLICY carpeta_nodos_compartidos ON carpeta');
    await queryRunner.query('DROP POLICY archivo_nodos_compartidos ON archivo');
    await queryRunner.query('DROP TABLE comparticion');
  }

  private async createTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE comparticion (
        id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        propietario_id  uuid        NOT NULL REFERENCES usuario(id),
        destinatario_id uuid        NOT NULL REFERENCES usuario(id),
        archivo_id      uuid        REFERENCES archivo(id) ON DELETE CASCADE,
        carpeta_id      uuid        REFERENCES carpeta(id) ON DELETE CASCADE,
        nivel           varchar(8)  NOT NULL,
        creado_en       timestamptz NOT NULL DEFAULT now(),
        actualizado_en  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_comparticion_nivel CHECK (nivel IN ('EDITOR', 'VIEWER')),
        CONSTRAINT ck_comparticion_nodo CHECK ((archivo_id IS NULL) <> (carpeta_id IS NULL)),
        CONSTRAINT ck_comparticion_distinto CHECK (destinatario_id <> propietario_id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_comparticion_archivo_destinatario ON comparticion (archivo_id, destinatario_id)
        WHERE archivo_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_comparticion_carpeta_destinatario ON comparticion (carpeta_id, destinatario_id)
        WHERE carpeta_id IS NOT NULL
    `);
    await queryRunner.query(
      'CREATE INDEX idx_comparticion_destinatario ON comparticion (destinatario_id)',
    );
  }

  private async createAppPolicies(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE comparticion ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE comparticion FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY comparticion_propietario ON comparticion TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id()
                    AND ${NODE_OWNED_BY_ACTOR})
    `);
    await queryRunner.query(
      `CREATE POLICY comparticion_destinatario ON comparticion FOR SELECT TO nimbo_app USING (${GRANTEE_OF_ROW})`,
    );
    await queryRunner.query(
      `CREATE POLICY comparticion_destinatario_salir ON comparticion FOR DELETE TO nimbo_app USING (${GRANTEE_OF_ROW})`,
    );
  }

  /** Lo único que ve el dueño bajo `FORCE` para `nodos_compartidos()`, siempre acotado al actor de la sesión. */
  private async createOwnerPolicies(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE POLICY comparticion_nodos_compartidos ON comparticion FOR SELECT TO CURRENT_USER USING (${GRANTEE_OF_ROW})`,
    );
    for (const table of ['archivo', 'carpeta']) {
      await queryRunner.query(
        `CREATE POLICY ${table}_nodos_compartidos ON ${table} FOR SELECT TO CURRENT_USER
           USING (${LIVE_NODE_OF_SHARER(table)})`,
      );
    }
  }
}
