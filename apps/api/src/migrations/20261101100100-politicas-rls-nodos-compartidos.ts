import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Archivos o carpetas que `nodos_compartidos()` da al actor de la sesión (la regla vive una vez, plan 012 §1). */
const SHARED_WITH_ACTOR = (type: 'archivo' | 'carpeta', idColumn: string): string =>
  `nimbo_actor_role() = 'CLIENT'
   AND ${idColumn} IN (SELECT nodo_id FROM nodos_compartidos() WHERE tipo_nodo = '${type}')`;

/** La versión de la fila es la vigente de su archivo: el destinatario nunca lee versiones antiguas (014 RN-7). */
const CURRENT_VERSION_SHARED = `${SHARED_WITH_ACTOR('archivo', 'version_archivo.archivo_id')}
   AND EXISTS (SELECT 1 FROM archivo a
                WHERE a.id = version_archivo.archivo_id AND a.version_actual_id = version_archivo.id)`;

/** Tablas cuya política de cliente se apoya en `EXISTS (archivo …)`: al abrir `archivo` al destinatario, se acotan. */
const FILE_SCOPED_POLICIES = [
  ['version_archivo', 'version_archivo_cliente'],
  ['indexacion', 'indexacion_cliente'],
  ['fragmento', 'fragmento_cliente'],
] as const;

/** Condición de las políticas de cliente de `FILE_SCOPED_POLICIES`; con `ownerOnly`, además el archivo es del actor. */
const fileOfActor = (table: string, ownerOnly: boolean): string =>
  `nimbo_actor_role() = 'CLIENT'
   AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = ${table}.archivo_id${
     ownerOnly ? ' AND a.propietario_id = nimbo_actor_id()' : ''
   })`;

/**
 * Lo que el destinatario lee de lo compartido (spec 012 CA-12, CA-13, CA-17, CA-21; plan §3, DF-85).
 *
 * - `archivo_compartido` y `carpeta_compartida` (`FOR SELECT`): los nodos de `nodos_compartidos()`, así la base niega
 *   lo no compartido aunque la consulta olvide filtrar. No hay política de escritura: solo el propietario escribe.
 * - `version_archivo_compartida` (`FOR SELECT`): solo la versión vigente de un archivo compartido (ficha y descarga).
 * - `version_archivo_cliente`, `indexacion_cliente` y `fragmento_cliente` decidían por `EXISTS (archivo …)`; como el
 *   destinatario ahora ve `archivo`, se acotan al propietario (si no, leería versiones antiguas y podría escribir
 *   versiones o fragmentos ajenos). La lectura de fragmentos compartidos para el agente es de T-09.
 * - Las políticas del Editor en `sesion_edicion`/`participacion` llegan con T-09 (PD-108). Los roles internos siguen sin
 *   política nueva.
 */
export class PoliticasRlsNodosCompartidos20261101100100 implements MigrationInterface {
  name = 'PoliticasRlsNodosCompartidos20261101100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.alterFileScopedPolicies(queryRunner, true);
    await queryRunner.query(
      `CREATE POLICY archivo_compartido ON archivo FOR SELECT TO nimbo_app
         USING (${SHARED_WITH_ACTOR('archivo', 'id')})`,
    );
    await queryRunner.query(
      `CREATE POLICY carpeta_compartida ON carpeta FOR SELECT TO nimbo_app
         USING (${SHARED_WITH_ACTOR('carpeta', 'id')})`,
    );
    await queryRunner.query(
      `CREATE POLICY version_archivo_compartida ON version_archivo FOR SELECT TO nimbo_app
         USING (${CURRENT_VERSION_SHARED})`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY version_archivo_compartida ON version_archivo');
    await queryRunner.query('DROP POLICY carpeta_compartida ON carpeta');
    await queryRunner.query('DROP POLICY archivo_compartido ON archivo');
    await this.alterFileScopedPolicies(queryRunner, false);
  }

  /** `ownerOnly` acota al propietario (`up`); sin él vuelve a la condición de 005 y 019 (`down`). */
  private async alterFileScopedPolicies(
    queryRunner: QueryRunner,
    ownerOnly: boolean,
  ): Promise<void> {
    for (const [table, policy] of FILE_SCOPED_POLICIES) {
      const condition = fileOfActor(table, ownerOnly);
      await queryRunner.query(
        `ALTER POLICY ${policy} ON ${table} USING (${condition}) WITH CHECK (${condition})`,
      );
    }
  }
}
