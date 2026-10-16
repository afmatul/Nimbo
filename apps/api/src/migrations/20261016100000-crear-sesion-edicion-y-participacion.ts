import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sesiones de edición y participantes (spec 016, plan §3; DF-39, DF-70). Una sesión va desde que entra el primer
 * editor hasta que ONLYOFFICE entrega el documento (RN-4); genera como máximo una versión (1:0..1).
 *
 * - `archivo_id` y `version_base_id` **sin FK** (DF-70): la purga definitiva del archivo no borra la evidencia de una
 *   sesión `fallida` (CA-14, RN-11). `propietario_id` y `abierta_por` sí apuntan a `usuario`.
 * - `motivo_fallo` existe si y solo si la sesión está `fallida`; `uq_sesion_edicion_abierta` deja una sola sesión
 *   abierta (`activa` o `guardando`) por archivo y resuelve la carrera de dos aperturas simultáneas.
 * - `participacion` (N:M `participa`) cae en cascada con su sesión; `idx_participacion_activa` sirve al conteo de
 *   editores conectados frente al límite del plan (CA-7).
 * - RLS como `archivo_cliente`: solo el cliente propietario (hasta 012, PD-95). Sin política para roles internos ni
 *   de mantenimiento (CA-17, Art. IX.1): `nimbo_app` sin actor no ve filas.
 */
export class CrearSesionEdicionYParticipacion20261016100000 implements MigrationInterface {
  name = 'CrearSesionEdicionYParticipacion20261016100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createSessions(queryRunner);
    await this.createParticipations(queryRunner);
    await this.enableRowSecurity(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY participacion_cliente ON participacion');
    await queryRunner.query('DROP POLICY sesion_edicion_cliente ON sesion_edicion');
    await queryRunner.query('DROP TABLE participacion');
    await queryRunner.query('DROP TABLE sesion_edicion');
  }

  private async createSessions(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sesion_edicion (
        id              uuid        PRIMARY KEY,
        archivo_id      uuid        NOT NULL,
        propietario_id  uuid        NOT NULL REFERENCES usuario(id),
        abierta_por     uuid        NOT NULL REFERENCES usuario(id),
        version_base_id uuid        NOT NULL,
        estado          varchar(12) NOT NULL,
        motivo_fallo    varchar(30),
        iniciada_en     timestamptz NOT NULL,
        finalizada_en   timestamptz,
        CONSTRAINT ck_sesion_edicion_estado
          CHECK (estado IN ('activa', 'guardando', 'cerrada', 'sin_cambios', 'fallida')),
        CONSTRAINT ck_sesion_edicion_motivo
          CHECK (motivo_fallo IN ('integridad', 'editor', 'archivo_purgado', 'almacenamiento')),
        CONSTRAINT ck_sesion_edicion_fallo CHECK ((estado = 'fallida') = (motivo_fallo IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_sesion_edicion_abierta ON sesion_edicion (archivo_id)
        WHERE estado IN ('activa', 'guardando')
    `);
    await queryRunner.query(
      'CREATE INDEX idx_sesion_edicion_propietario ON sesion_edicion (propietario_id, iniciada_en DESC)',
    );
  }

  private async createParticipations(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE participacion (
        sesion_edicion_id uuid        NOT NULL REFERENCES sesion_edicion(id) ON DELETE CASCADE,
        usuario_id        uuid        NOT NULL REFERENCES usuario(id),
        entro_en          timestamptz NOT NULL,
        salio_en          timestamptz,
        PRIMARY KEY (sesion_edicion_id, usuario_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_participacion_activa ON participacion (sesion_edicion_id) WHERE salio_en IS NULL',
    );
  }

  private async enableRowSecurity(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['sesion_edicion', 'participacion']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
    await queryRunner.query(`
      CREATE POLICY sesion_edicion_cliente ON sesion_edicion TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
        WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
    `);
    await queryRunner.query(`
      CREATE POLICY participacion_cliente ON participacion TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM sesion_edicion s WHERE s.id = participacion.sesion_edicion_id))
        WITH CHECK (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM sesion_edicion s WHERE s.id = participacion.sesion_edicion_id))
    `);
  }
}
