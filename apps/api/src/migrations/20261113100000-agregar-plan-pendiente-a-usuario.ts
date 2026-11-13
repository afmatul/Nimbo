import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan de pago elegido al registrarse y aún no contratado (registro con plan). Lo escribe `identity` al registrar la
 * cuenta y lo limpia `billing` al aprobar el pago, o al verificar el correo si el plan es gratuito o ya no existe.
 * Sin llave foránea a `plan.slug`: el valor llega del navegador antes de que exista la suscripción y `billing` decide si
 * es válido. Mismo largo que `plan.slug`.
 */
export class AgregarPlanPendienteAUsuario20261113100000 implements MigrationInterface {
  name = 'AgregarPlanPendienteAUsuario20261113100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE usuario ADD COLUMN plan_pendiente_slug varchar(50) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE usuario DROP COLUMN plan_pendiente_slug');
  }
}
