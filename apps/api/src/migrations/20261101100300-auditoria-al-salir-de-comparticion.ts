import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Holgura de `ocurrido_en` frente a `now()` (inicio de la transacción): el reloj de la API y el de Postgres difieren. */
const CLOCK_TOLERANCE = "interval '5 minutes'";

/**
 * Spec 012 CA-23 y S-8: «Salir» se audita como `share.revoked` en la actividad del **propietario**, con el destinatario
 * como actor. `evento_auditoria_alta` (004) solo deja a un `CLIENT` escribir eventos de su propia cuenta, así que se
 * suma una política `INSERT` acotada: solo `share.revoked`, de un archivo o carpeta, y solo si en ese momento existe
 * una compartición de ese nodo con el actor como destinatario y el afectado como propietario. El caso de uso escribe el
 * evento **antes** de borrar la fila (en la misma transacción); sin la fila, la política lo rechaza. La lectura de
 * `comparticion` pasa por su RLS (`comparticion_destinatario`): el actor solo ve sus propias filas.
 *
 * El evento es exactamente el que escribe el caso de uso (SEC-3): `atributos` son `nodeType` (el `tipo_recurso`) y el
 * `level` de esa compartición, nada más, y `ocurrido_en` cae cerca de `now()`. Así el destinatario no deja texto libre
 * ni fechas falsas en la actividad ajena.
 */
export class AuditoriaAlSalirDeComparticion20261101100300 implements MigrationInterface {
  name = 'AuditoriaAlSalirDeComparticion20261101100300';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE POLICY evento_auditoria_salir_comparticion ON evento_auditoria FOR INSERT TO nimbo_app
        WITH CHECK (actor_id = nimbo_actor_id() AND rol_actor = 'CLIENT' AND nimbo_actor_role() = 'CLIENT'
                    AND accion = 'share.revoked' AND tipo_recurso IN ('file', 'folder')
                    AND EXISTS (SELECT 1 FROM comparticion c
                                 WHERE c.destinatario_id = nimbo_actor_id()
                                   AND c.propietario_id = evento_auditoria.usuario_afectado_id
                                   AND evento_auditoria.recurso_id
                                       = CASE evento_auditoria.tipo_recurso
                                           WHEN 'file' THEN c.archivo_id ELSE c.carpeta_id END
                                   AND evento_auditoria.atributos
                                       = jsonb_build_object('nodeType', evento_auditoria.tipo_recurso,
                                                            'level', c.nivel))
                    AND ocurrido_en BETWEEN now() - ${CLOCK_TOLERANCE} AND now() + ${CLOCK_TOLERANCE})
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY evento_auditoria_salir_comparticion ON evento_auditoria');
  }
}
