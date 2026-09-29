import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permisos del rol de aplicación `nimbo_app` (spec 003 CA-13, plan §4 (b), ADR-0005, PD-39). El rol lo crea
 * `infra/postgres/init/10-nimbo-app.sh` (es del *cluster* y su contraseña es un secreto), no esta migración; por eso
 * `down` no lo borra. Corre como el dueño de las tablas (`DATABASE_MIGRATION_URL`), así que los privilegios por
 * defecto alcanzan a las tablas que creen las migraciones siguientes: una tabla que no deba admitir `DELETE` lo
 * revoca en su propia migración.
 */
export class ConcederPermisosNimboApp20260928110000 implements MigrationInterface {
  name = 'ConcederPermisosNimboApp20260928110000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r pg_roles%ROWTYPE;
      BEGIN
        SELECT * INTO r FROM pg_roles WHERE rolname = 'nimbo_app';
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Falta el rol nimbo_app: ejecuta pnpm db:app-role (infra/postgres/init/10-nimbo-app.sh)';
        END IF;
        IF r.rolsuper OR r.rolbypassrls THEN
          RAISE EXCEPTION 'nimbo_app no puede ser superusuario ni tener BYPASSRLS (ADR-0005)';
        END IF;
      END $$
    `);
    await queryRunner.query('GRANT USAGE ON SCHEMA public TO nimbo_app');
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nimbo_app',
    );
    // Historial de TypeORM: solo el dueño.
    await queryRunner.query('REVOKE ALL ON TABLE migracion FROM nimbo_app');
    // PD-39: las cuentas y sus tokens no se borran desde la app.
    await queryRunner.query('REVOKE DELETE ON TABLE usuario, token_cuenta FROM nimbo_app');
    await queryRunner.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nimbo_app',
    );
    await queryRunner.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nimbo_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM nimbo_app',
    );
    await queryRunner.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM nimbo_app',
    );
    await queryRunner.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nimbo_app');
    await queryRunner.query('REVOKE USAGE ON SCHEMA public FROM nimbo_app');
  }
}
