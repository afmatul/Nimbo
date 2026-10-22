import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['indexacion', 'fragmento'] as const;

/**
 * Estado de indexación por versión y fragmentos indexados (spec 019, plan §3; DF-07, DF-14, DF-78). La extensión
 * `vector` ya existe (`20260915120000`).
 *
 * - `indexacion`: una fila por versión (`uq_indexacion_version`, idempotencia CA-9 y RN-10); hay `motivo` si y solo si
 *   el estado es `no_indexable` o `fallido` (`ck_indexacion_motivo`). `idx_indexacion_pendiente` sirve a la
 *   conciliación (`pendiente`/`indexando` viejos, CA-23).
 * - `fragmento`: `archivo_id` desnormalizado para la RLS y el filtro previo por `accessibleNodes` (DF-14);
 *   `procedencia` es un objeto con `tipo` (DF-07); `texto_busq` se genera en español y lo consume 018 (PD-124).
 * - Ambas caen en cascada con su archivo (purga, CA-15) y con su versión (retención). Las acciones referenciales no
 *   pasan por RLS: la purga de la propietaria las borra igual.
 * - RLS como `version_archivo_cliente`: solo `CLIENT` y solo sobre archivos que `archivo` (también con RLS) le deja
 *   ver. Sin política para roles internos ni para `nimbo_app` sin actor: 0 filas (CA-20, Art. IX.1).
 */
export class CrearIndexacionYFragmento20261022100000 implements MigrationInterface {
  name = 'CrearIndexacionYFragmento20261022100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createIndexing(queryRunner);
    await this.createChunks(queryRunner);
    await this.enableRowSecurity(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY fragmento_cliente ON fragmento');
    await queryRunner.query('DROP POLICY indexacion_cliente ON indexacion');
    await queryRunner.query('DROP TABLE fragmento');
    await queryRunner.query('DROP TABLE indexacion');
  }

  private async createIndexing(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE indexacion (
        id                 uuid        PRIMARY KEY,
        archivo_id         uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        version_archivo_id uuid        NOT NULL REFERENCES version_archivo(id) ON DELETE CASCADE,
        estado             varchar(12) NOT NULL,
        motivo             varchar(30),
        intentos           smallint    NOT NULL DEFAULT 0,
        fragmentos         integer     NOT NULL DEFAULT 0,
        duracion_ms        integer,
        creado_en          timestamptz NOT NULL,
        actualizado_en     timestamptz NOT NULL,
        CONSTRAINT uq_indexacion_version UNIQUE (version_archivo_id),
        CONSTRAINT ck_indexacion_estado
          CHECK (estado IN ('pendiente', 'indexando', 'indexado', 'no_indexable', 'fallido')),
        CONSTRAINT ck_indexacion_motivo_valor
          CHECK (motivo IN ('sin_texto', 'formato_no_soportado', 'demasiado_grande', 'proveedor_no_disponible',
                            'lectura_fallida', 'error_interno')),
        CONSTRAINT ck_indexacion_motivo CHECK ((estado IN ('no_indexable', 'fallido')) = (motivo IS NOT NULL))
      )
    `);
    await queryRunner.query('CREATE INDEX idx_indexacion_archivo ON indexacion (archivo_id)');
    await queryRunner.query(`
      CREATE INDEX idx_indexacion_pendiente ON indexacion (actualizado_en)
        WHERE estado IN ('pendiente', 'indexando')
    `);
  }

  private async createChunks(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fragmento (
        id                 uuid        PRIMARY KEY,
        archivo_id         uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        version_archivo_id uuid        NOT NULL REFERENCES version_archivo(id) ON DELETE CASCADE,
        orden              integer     NOT NULL,
        texto              text        NOT NULL,
        procedencia        jsonb       NOT NULL,
        embedding          vector(768) NOT NULL,
        texto_busq         tsvector    GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, texto)) STORED,
        creado_en          timestamptz NOT NULL,
        CONSTRAINT uq_fragmento_version_orden UNIQUE (version_archivo_id, orden),
        CONSTRAINT ck_fragmento_procedencia
          CHECK (jsonb_typeof(procedencia) = 'object' AND procedencia ? 'tipo')
      )
    `);
    await queryRunner.query('CREATE INDEX idx_fragmento_archivo ON fragmento (archivo_id)');
    await queryRunner.query(
      'CREATE INDEX idx_fragmento_embedding ON fragmento USING hnsw (embedding vector_cosine_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_fragmento_texto_busq ON fragmento USING gin (texto_busq)',
    );
  }

  private async enableRowSecurity(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`
        CREATE POLICY ${table}_cliente ON ${table} TO nimbo_app
          USING      (nimbo_actor_role() = 'CLIENT'
                      AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = ${table}.archivo_id))
          WITH CHECK (nimbo_actor_role() = 'CLIENT'
                      AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = ${table}.archivo_id))
      `);
    }
  }
}
