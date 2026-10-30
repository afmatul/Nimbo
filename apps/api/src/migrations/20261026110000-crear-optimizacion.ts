import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optimizaciones de imágenes (spec 021, plan §3; DF-22: sin tabla `trabajo`, el estado de negocio vive aquí y BullMQ
 * solo ejecuta).
 *
 * - Una fila por pedido; a lo sumo una **en curso** por archivo (`uq_optimizacion_en_curso`, RN-9). Las finales quedan
 *   como historial y no ocupan ese lugar.
 * - `version_origen_id` y `version_resultado_id` sin FK: 014b purga el original y la poda borra versiones, y la fila
 *   debe seguir describiendo qué se optimizó. Cae en cascada con su archivo (purga).
 * - Hay `motivo` si y solo si el estado es `no_disponible`, `descartada` o `fallida` (`ck_optimizacion_motivo`).
 * - Las mismas reglas de resultado que `OptimizationJob` (`assertResult`): la versión de resultado existe en toda
 *   ejecución confirmada (`optimizando`, `completada`, `descartada`), puede quedar en una `fallida` y en ningún otro
 *   estado; una `estimada` o una ejecución tienen bytes estimados; solo `completada` y `descartada` llevan bytes reales,
 *   y una `completada` siempre ahorra.
 * - RLS solo para el **dueño del archivo** (`propietario_id = nimbo_actor_id()`): un Editor que ve un archivo compartido
 *   (012) no ve ni crea optimizaciones (RN-5). Sin política para roles internos ni para `nimbo_app` sin actor: 0 filas.
 */
export class CrearOptimizacion20261026110000 implements MigrationInterface {
  name = 'CrearOptimizacion20261026110000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createTable(queryRunner);
    await this.addResultChecks(queryRunner);
    await this.createIndexes(queryRunner);
    await this.enableRowSecurity(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY optimizacion_cliente ON optimizacion');
    await queryRunner.query('DROP TABLE optimizacion');
  }

  private async createTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE optimizacion (
        id                   uuid        PRIMARY KEY,
        archivo_id           uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        version_origen_id    uuid        NOT NULL,
        version_resultado_id uuid,
        estado               varchar(14) NOT NULL,
        motivo               varchar(24),
        bytes_origen         bigint      NOT NULL CHECK (bytes_origen > 0),
        bytes_estimados      bigint      CHECK (bytes_estimados > 0),
        bytes_resultado      bigint      CHECK (bytes_resultado > 0),
        creado_en            timestamptz NOT NULL,
        actualizado_en       timestamptz NOT NULL,
        CONSTRAINT ck_optimizacion_estado
          CHECK (estado IN ('estimando', 'estimada', 'no_conviene', 'no_disponible', 'optimizando', 'completada',
                            'descartada', 'fallida')),
        CONSTRAINT ck_optimizacion_motivo_valor
          CHECK (motivo IN ('tamano', 'pixeles', 'animada', 'ilegible', 'ahorro_minimo', 'version_cambiada',
                            'archivo_eliminado', 'integridad', 'servicio_no_disponible')),
        CONSTRAINT ck_optimizacion_motivo
          CHECK ((estado IN ('no_disponible', 'descartada', 'fallida')) = (motivo IS NOT NULL))
      )
    `);
  }

  /** Reglas de resultado de `OptimizationJob` (`assertResult`), con la tabla todavía vacía. */
  private async addResultChecks(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE optimizacion
        ADD CONSTRAINT ck_optimizacion_version_resultado
          CHECK (CASE WHEN estado IN ('optimizando', 'completada', 'descartada') THEN version_resultado_id IS NOT NULL
                      WHEN estado = 'fallida' THEN true
                      ELSE version_resultado_id IS NULL END),
        ADD CONSTRAINT ck_optimizacion_bytes_estimados
          CHECK (bytes_estimados IS NOT NULL
                 OR (estado NOT IN ('estimada', 'optimizando', 'completada', 'descartada')
                     AND version_resultado_id IS NULL)),
        ADD CONSTRAINT ck_optimizacion_bytes_resultado
          CHECK (bytes_resultado IS NULL OR estado IN ('completada', 'descartada')),
        ADD CONSTRAINT ck_optimizacion_completada
          CHECK (estado <> 'completada' OR (bytes_resultado IS NOT NULL AND bytes_resultado < bytes_origen))
    `);
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_optimizacion_en_curso ON optimizacion (archivo_id)
        WHERE estado IN ('estimando', 'optimizando')
    `);
    await queryRunner.query(
      'CREATE INDEX idx_optimizacion_archivo ON optimizacion (archivo_id, creado_en DESC)',
    );
  }

  private async enableRowSecurity(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE optimizacion ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE optimizacion FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY optimizacion_cliente ON optimizacion TO nimbo_app
        USING      (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM archivo a
                                 WHERE a.id = optimizacion.archivo_id AND a.propietario_id = nimbo_actor_id()))
        WITH CHECK (nimbo_actor_role() = 'CLIENT'
                    AND EXISTS (SELECT 1 FROM archivo a
                                 WHERE a.id = optimizacion.archivo_id AND a.propietario_id = nimbo_actor_id()))
    `);
  }
}
