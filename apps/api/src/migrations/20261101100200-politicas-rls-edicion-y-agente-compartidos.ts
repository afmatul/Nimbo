import type { MigrationInterface, QueryRunner } from 'typeorm';

/** `column` es un archivo que `nodos_compartidos()` da al actor como Editor (la regla vive una vez, plan 012 §1). */
const EDITOR_OF = (column: string): string =>
  `nimbo_actor_role() = 'CLIENT'
   AND ${column} IN (SELECT nodo_id FROM nodos_compartidos() WHERE tipo_nodo = 'archivo' AND nivel = 'EDITOR')`;

/**
 * La sesión nueva es de la propietaria de un archivo que el actor ve (SEC-4): nadie abre una sesión a su nombre sobre
 * un archivo ajeno ni sobre un id que no alcanza, y el Editor solo la abre a nombre de la propietaria.
 */
const SESSION_OF_FILE_OWNER = `propietario_id = (SELECT a.propietario_id FROM archivo a
                                                  WHERE a.id = sesion_edicion.archivo_id)`;

/**
 * Solo la propietaria cambia su sesión y no la pasa a otra cuenta (SEC-2). No exige que el archivo exista: la sesión de
 * un archivo purgado se marca `fallida` (016 CA-14).
 */
const CHANGED_BY_ITS_OWNER = `propietario_id = nimbo_actor_id()
   AND NOT EXISTS (SELECT 1 FROM archivo a
                    WHERE a.id = sesion_edicion.archivo_id AND a.propietario_id <> nimbo_actor_id())`;

/** La participación es de una sesión sobre un archivo compartido con el actor como Editor. */
const PARTICIPATION_OF_SHARED_SESSION = (openOnly: boolean): string =>
  `nimbo_actor_role() = 'CLIENT'
   AND EXISTS (SELECT 1 FROM sesion_edicion s
                WHERE s.id = participacion.sesion_edicion_id AND ${EDITOR_OF('s.archivo_id')}${
                  openOnly ? " AND s.estado IN ('activa', 'guardando')" : ''
                })`;

/** Su propia participación en una sesión abierta: el Editor no se suma a la autoría de una versión ya cerrada. */
const OWN_PARTICIPATION = `${PARTICIPATION_OF_SHARED_SESSION(true)} AND usuario_id = nimbo_actor_id()`;

/** Condición de `participacion_cliente`; con `ownerOnly`, la sesión además es de la cuenta del actor. */
const participationOfVisibleSession = (ownerOnly: boolean): string =>
  `nimbo_actor_role() = 'CLIENT'
   AND EXISTS (SELECT 1 FROM sesion_edicion s WHERE s.id = participacion.sesion_edicion_id${
     ownerOnly ? ' AND s.propietario_id = nimbo_actor_id()' : ''
   })`;

/** Fila de la versión vigente de un archivo compartido con el actor, a cualquier nivel (como `version_archivo_compartida`). */
const currentVersionShared = (table: 'indexacion' | 'fragmento'): string =>
  `nimbo_actor_role() = 'CLIENT'
   AND ${table}.archivo_id IN (SELECT nodo_id FROM nodos_compartidos() WHERE tipo_nodo = 'archivo')
   AND EXISTS (SELECT 1 FROM archivo a
                WHERE a.id = ${table}.archivo_id AND a.version_actual_id = ${table}.version_archivo_id)`;

/** Políticas nuevas: nombre, tabla, modo (`AS RESTRICTIVE` y orden) y cláusulas (`USING`/`WITH CHECK`). */
const POLICIES: readonly (readonly [string, string, string, string])[] = [
  [
    'sesion_edicion_compartida',
    'sesion_edicion',
    'FOR SELECT',
    `USING (${EDITOR_OF('archivo_id')})`,
  ],
  [
    'sesion_edicion_compartida_alta',
    'sesion_edicion',
    'FOR INSERT',
    `WITH CHECK (${EDITOR_OF('archivo_id')} AND abierta_por = nimbo_actor_id())`,
  ],
  [
    'sesion_edicion_compartida_bloqueo',
    'sesion_edicion',
    'FOR UPDATE',
    `USING (${EDITOR_OF('archivo_id')}) WITH CHECK (false)`,
  ],
  [
    'sesion_edicion_alta_de_la_propietaria',
    'sesion_edicion',
    'AS RESTRICTIVE FOR INSERT',
    `WITH CHECK (${SESSION_OF_FILE_OWNER})`,
  ],
  [
    'sesion_edicion_cambio_de_la_propietaria',
    'sesion_edicion',
    'AS RESTRICTIVE FOR UPDATE',
    `USING (true) WITH CHECK (${CHANGED_BY_ITS_OWNER})`,
  ],
  [
    'participacion_compartida',
    'participacion',
    'FOR SELECT',
    `USING (${PARTICIPATION_OF_SHARED_SESSION(false)})`,
  ],
  [
    'participacion_compartida_alta',
    'participacion',
    'FOR INSERT',
    `WITH CHECK (${OWN_PARTICIPATION})`,
  ],
  [
    'participacion_compartida_cambio',
    'participacion',
    'FOR UPDATE',
    `USING (${OWN_PARTICIPATION}) WITH CHECK (${OWN_PARTICIPATION})`,
  ],
  [
    'indexacion_compartida',
    'indexacion',
    'FOR SELECT',
    `USING (${currentVersionShared('indexacion')})`,
  ],
  [
    'fragmento_compartido',
    'fragmento',
    'FOR SELECT',
    `USING (${currentVersionShared('fragmento')})`,
  ],
];

/**
 * Lo que el Editor necesita para editar lo compartido y lo que el agente lee de lo compartido (spec 012 CA-15, CA-16;
 * plan §3; PD-108, PD-134). Sin políticas para el Lector en `sesion_edicion`/`participacion`: abre en solo lectura sin
 * sesión (016 RN-2). Los roles internos siguen sin política.
 *
 * - `sesion_edicion`: el Editor la lee, la crea (abierta por él y de la propietaria del archivo) y la bloquea
 *   (`SELECT … FOR UPDATE` exige el `USING` de una política `UPDATE`, no su `WITH CHECK`); cerrarla o guardarla lo hace
 *   la propietaria (016 plan §4). Dos políticas `AS RESTRICTIVE` valen para toda escritura, también la de 016: el alta
 *   es de la propietaria de un archivo que el actor ve (SEC-4) y el cambio, de la propietaria sin pasarla a otra cuenta
 *   (SEC-2). Bastan sin trigger: el bloqueo del Editor no evalúa `WITH CHECK`, y su `UPDATE` no lo cumple.
 * - `participacion`: `participacion_cliente` decidía por la sesión visible, que ahora alcanza la compartida; se acota a
 *   la propietaria y el Editor lee las participaciones de la sesión y solo da de alta o cierra la suya, mientras la
 *   sesión siga abierta (no se suma a la autoría de una versión ya guardada).
 * - `indexacion`/`fragmento`: solo `SELECT`, y solo de la versión vigente de un archivo compartido (Lector o Editor);
 *   la escritura sigue siendo solo de la propietaria (`*_cliente`, migración B).
 */
export class PoliticasRlsEdicionYAgenteCompartidos20261101100200 implements MigrationInterface {
  name = 'PoliticasRlsEdicionYAgenteCompartidos20261101100200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.alterParticipationPolicy(queryRunner, true);
    for (const [name, table, mode, clauses] of POLICIES) {
      await queryRunner.query(`CREATE POLICY ${name} ON ${table} ${mode} TO nimbo_app ${clauses}`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name, table] of [...POLICIES].reverse()) {
      await queryRunner.query(`DROP POLICY ${name} ON ${table}`);
    }
    await this.alterParticipationPolicy(queryRunner, false);
  }

  /** `ownerOnly` acota a la propietaria (`up`); sin él vuelve a la condición de 016 (`down`). */
  private async alterParticipationPolicy(
    queryRunner: QueryRunner,
    ownerOnly: boolean,
  ): Promise<void> {
    const condition = participationOfVisibleSession(ownerOnly);
    await queryRunner.query(
      `ALTER POLICY participacion_cliente ON participacion USING (${condition}) WITH CHECK (${condition})`,
    );
  }
}
