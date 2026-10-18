import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Las columnas nuevas que escriben la renovación, el cambio de plan y los avisos (como el `GRANT` de la 009, PR #62 #10). */
const WRITABLE_COLUMNS =
  'estado, renovacion_automatica, plan_pendiente_id, aviso_previo_para, aviso_vencida_para';

/**
 * Renovación, vencimiento y cambio de plan (spec 010, plan §3; DF-70). `suscripcion` suma:
 *
 * - `estado` (`vigente` | `solo_lectura`), única fuente de la solo lectura (RN-5); Personal nunca la tiene porque no
 *   vence (`ck_suscripcion_solo_lectura`, CA-15).
 * - `renovacion_automatica`, encendida al contratar (RN-3); las filas existentes quedan encendidas.
 * - `plan_pendiente_id` (DF-25, RN-7): uno a la vez y distinto del actual.
 * - `aviso_previo_para` y `aviso_vencida_para`: para qué `vence_en` se envió cada correo (CA-5, CA-2), así hay uno por
 *   periodo.
 *
 * `nimbo_app` solo actualiza columnas concedidas (009): se le conceden las nuevas. La RLS no cambia. `down` las retira
 * en orden inverso.
 */
export class RenovacionDeSuscripcion20261018100000 implements MigrationInterface {
  name = 'RenovacionDeSuscripcion20261018100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE suscripcion
        ADD COLUMN estado varchar(20) NOT NULL DEFAULT 'vigente',
        ADD COLUMN renovacion_automatica boolean NOT NULL DEFAULT true,
        ADD COLUMN plan_pendiente_id uuid REFERENCES plan(id),
        ADD COLUMN aviso_previo_para timestamptz,
        ADD COLUMN aviso_vencida_para timestamptz,
        ADD CONSTRAINT ck_suscripcion_estado CHECK (estado IN ('vigente', 'solo_lectura')),
        ADD CONSTRAINT ck_suscripcion_solo_lectura CHECK (estado = 'vigente' OR vence_en IS NOT NULL),
        ADD CONSTRAINT ck_suscripcion_plan_pendiente CHECK (plan_pendiente_id IS DISTINCT FROM plan_id)
    `);
    await queryRunner.query(
      'CREATE INDEX idx_suscripcion_vence_en ON suscripcion (vence_en) WHERE vence_en IS NOT NULL',
    );
    await queryRunner.query(`GRANT UPDATE (${WRITABLE_COLUMNS}) ON suscripcion TO nimbo_app`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE UPDATE (${WRITABLE_COLUMNS}) ON suscripcion FROM nimbo_app`);
    await queryRunner.query('DROP INDEX idx_suscripcion_vence_en');
    await queryRunner.query(`
      ALTER TABLE suscripcion
        DROP CONSTRAINT ck_suscripcion_plan_pendiente,
        DROP CONSTRAINT ck_suscripcion_solo_lectura,
        DROP CONSTRAINT ck_suscripcion_estado,
        DROP COLUMN aviso_vencida_para,
        DROP COLUMN aviso_previo_para,
        DROP COLUMN plan_pendiente_id,
        DROP COLUMN renovacion_automatica,
        DROP COLUMN estado
    `);
  }
}
