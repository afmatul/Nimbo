import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una sesión sin revocar por dispositivo (cookie `nimbo_did`, 002 D-4). Hasta ahora cada inicio de sesión desde el
 * mismo navegador sumaba una fila y «Seguridad» mostraba ese navegador varias veces; `SessionService.open` ahora revoca
 * las anteriores del mismo dispositivo. Esta migración revoca los duplicados que ya existen (conserva la de uso más
 * reciente) y deja el invariante en un índice único parcial. `down` solo quita el índice: las sesiones revocadas no se
 * reabren, porque reabrirlas devolvería validez a tokens de refresco que el navegador ya reemplazó.
 */
export class UnaSesionActivaPorDispositivo20261104100100 implements MigrationInterface {
  name = 'UnaSesionActivaPorDispositivo20261104100100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE sesion s
         SET revocada_en = now()
        FROM (
          SELECT id,
                 row_number() OVER (
                   PARTITION BY usuario_id, dispositivo_id ORDER BY ultimo_uso DESC, creada_en DESC, id
                 ) AS orden
            FROM sesion
           WHERE revocada_en IS NULL
        ) duplicada
       WHERE s.id = duplicada.id AND duplicada.orden > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_sesion_dispositivo_id ON sesion (dispositivo_id) WHERE revocada_en IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_sesion_dispositivo_id');
  }
}
