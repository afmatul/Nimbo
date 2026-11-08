import type { MigrationInterface, QueryRunner } from 'typeorm';

const FUNCTION_SIGNATURE = 'enlace_por_token(char)';

/** Un cliente sobre las filas de las que es propietario (spec 013 RN-1). */
const OWNER_OF_ROW = "nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id()";

/**
 * `WITH CHECK` del propietario: además, el archivo es suyo, así nadie publica lo ajeno a su nombre. «Vivo» no se exige
 * aquí sino en el `INSERT … SELECT` sobre `ownedNodes` del repositorio, para que revocar con el archivo en la papelera
 * no choque (CA-8).
 */
const FILE_OWNED_BY_ACTOR =
  'EXISTS (SELECT 1 FROM archivo a WHERE a.id = archivo_id AND a.propietario_id = nimbo_actor_id())';

/** Solo se actualiza un enlace sin revocar: la fecha de revocación de uno revocado no se reescribe (CA-8). */
const NOT_REVOKED = 'revocado_en IS NULL';

/** Revocar es irreversible (CA-8, RN-3): un `UPDATE` nunca deja `revocado_en` en `NULL`. */
const REVOKED = 'revocado_en IS NOT NULL';

/** Un enlace que todavía sirve: ni revocado ni vencido, con el reloj de la base (el llamador no lo controla). */
const AVAILABLE_LINK = 'revocado_en IS NULL AND vence_en > now()';

/**
 * `enlace_por_token(hash)`: la única puerta sin actor a `enlace_publico` (ADR-0039 regla 1). Devuelve 0 o 1 fila con
 * los tres identificadores del enlace disponible de ese hash; la clave, el vencimiento y el archivo se releen después
 * con RLS como el propietario. No lee `archivo` ni `usuario`: papelera, purga y suspensión las resuelven `storage` e
 * `identity` (regla 2).
 */
const LINK_BY_TOKEN_BODY = `
  SELECT e.id, e.archivo_id, e.propietario_id
    FROM public.enlace_publico e
   WHERE e.token_hash = p_token_hash AND e.revocado_en IS NULL AND e.vence_en > now()`;

/**
 * Enlaces públicos a un archivo (spec 013 CA-1, CA-4, CA-8, CA-11, CA-17; plan §3; ADR-0039; DF-09, DF-10, DF-86).
 *
 * - `enlace_publico`: el token no es la clave (DF-09); se guarda su SHA-256 en hexadecimal (`token_hash`, como
 *   `token_cuenta`) y la contraseña opcional como PHC Argon2id (`clave_hash`, DF-10). Solo archivos; a lo sumo un enlace
 *   sin revocar por archivo (RN-3). Revocar marca `revocado_en`; la purga del archivo lo borra en cascada (RN-5).
 *   Sin `intento_acceso` (plan D-5): el bloqueo vive en Redis.
 * - Permisos: `nimbo_app` no borra ni vacía la tabla y solo actualiza `revocado_en`.
 * - RLS: el propietario (cliente) lee, crea y revoca los suyos, una política por orden como en `comparticion`; la de
 *   `UPDATE` solo alcanza enlaces sin revocar y exige `revocado_en IS NOT NULL`, así revocar no se deshace ni se
 *   reescribe su fecha. Los roles internos no tienen política.
 *   Como `FORCE` también somete al dueño, `enlace_publico_por_token` (`TO CURRENT_USER`, solo `SELECT` de enlaces disponibles) es
 *   lo único que ve `enlace_por_token()`, que ejecuta como el dueño: la segunda barrera del filtro de su cuerpo.
 * - `enlace_por_token(char(64))`: `char(64)` como la columna, para que `uq_enlace_publico_token_hash` sirva la búsqueda.
 */
export class CrearEnlacePublico20261102100000 implements MigrationInterface {
  name = 'CrearEnlacePublico20261102100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createTable(queryRunner);
    await this.restrictAppPrivileges(queryRunner);
    await this.createPolicies(queryRunner);
    await queryRunner.query(`
      CREATE FUNCTION enlace_por_token(p_token_hash char(64))
        RETURNS TABLE (enlace_id uuid, archivo_id uuid, propietario_id uuid)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
        $$ ${LINK_BY_TOKEN_BODY} $$
    `);
    await queryRunner.query(`REVOKE ALL ON FUNCTION ${FUNCTION_SIGNATURE} FROM PUBLIC`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE} TO nimbo_app`);
  }

  /** La tabla se lleva sus índices, políticas y permisos. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION ${FUNCTION_SIGNATURE}`);
    await queryRunner.query('DROP TABLE enlace_publico');
  }

  private async createTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE enlace_publico (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        archivo_id     uuid        NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
        propietario_id uuid        NOT NULL REFERENCES usuario(id),
        token_hash     char(64)    NOT NULL,
        clave_hash     text,
        vence_en       timestamptz NOT NULL,
        creado_en      timestamptz NOT NULL DEFAULT now(),
        revocado_en    timestamptz,
        CONSTRAINT ck_enlace_publico_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_enlace_publico_vencimiento CHECK (vence_en > creado_en)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_enlace_publico_token_hash ON enlace_publico (token_hash)',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_enlace_publico_archivo_activo ON enlace_publico (archivo_id)
        WHERE revocado_en IS NULL
    `);
  }

  /** Los privilegios por defecto de 003 dan `SELECT/INSERT/UPDATE/DELETE`; aquí quedan lectura, alta y revocar. */
  private async restrictAppPrivileges(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('REVOKE UPDATE, DELETE, TRUNCATE ON enlace_publico FROM nimbo_app');
    await queryRunner.query('GRANT UPDATE (revocado_en) ON enlace_publico TO nimbo_app');
  }

  private async createPolicies(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE enlace_publico ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE enlace_publico FORCE ROW LEVEL SECURITY');
    await queryRunner.query(
      `CREATE POLICY enlace_publico_propietario ON enlace_publico FOR SELECT TO nimbo_app USING (${OWNER_OF_ROW})`,
    );
    await queryRunner.query(`
      CREATE POLICY enlace_publico_propietario_crear ON enlace_publico FOR INSERT TO nimbo_app
        WITH CHECK (${OWNER_OF_ROW} AND ${FILE_OWNED_BY_ACTOR})
    `);
    await queryRunner.query(`
      CREATE POLICY enlace_publico_propietario_revocar ON enlace_publico FOR UPDATE TO nimbo_app
        USING      (${OWNER_OF_ROW} AND ${NOT_REVOKED})
        WITH CHECK (${OWNER_OF_ROW} AND ${FILE_OWNED_BY_ACTOR} AND ${REVOKED})
    `);
    await queryRunner.query(
      `CREATE POLICY enlace_publico_por_token ON enlace_publico FOR SELECT TO CURRENT_USER USING (${AVAILABLE_LINK})`,
    );
  }
}
