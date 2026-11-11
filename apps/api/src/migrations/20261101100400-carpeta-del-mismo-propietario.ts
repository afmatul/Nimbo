import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Referencias a `carpeta` de 006: tabla, columna, nombre de la FK de 006, nombre de la compuesta y su `ON DELETE`. */
const FOLDER_REFERENCES: readonly (readonly [string, string, string, string, string])[] = [
  [
    'carpeta',
    'carpeta_padre_id',
    'carpeta_carpeta_padre_id_fkey',
    'fk_carpeta_padre_propietario',
    'SET NULL',
  ],
  [
    'carpeta',
    'eliminado_con_carpeta_id',
    'carpeta_eliminado_con_carpeta_id_fkey',
    'fk_carpeta_eliminado_con_propietario',
    'NO ACTION',
  ],
  [
    'archivo',
    'carpeta_id',
    'archivo_carpeta_id_fkey',
    'fk_archivo_carpeta_propietario',
    'SET NULL',
  ],
  [
    'archivo',
    'eliminado_con_carpeta_id',
    'archivo_eliminado_con_carpeta_id_fkey',
    'fk_archivo_eliminado_con_propietario',
    'NO ACTION',
  ],
];

/** `SET NULL` solo pone en `NULL` la columna de la carpeta: `propietario_id` es `NOT NULL` y no cambia. */
const onDelete = (column: string, action: string): string =>
  action === 'SET NULL' ? `SET NULL (${column})` : action;

/** Tablas con `FORCE` RLS (005, 006) que lee la validación de las FK. */
const VALIDATED_TABLES = ['archivo', 'carpeta'] as const;

/**
 * Corre `work` con `NO FORCE` RLS en `archivo` y `carpeta`, y lo devuelve al terminar, en la misma transacción.
 * Postgres valida una FK nueva con una consulta (`RI_Initial_Check`) que corre como el rol que migra y **con RLS**:
 * con un dueño `NOSUPERUSER` (ADR-0021) solo ve las filas de `archivo_mantenimiento`/`carpeta_mantenimiento` (las de
 * la papelera), así que un archivo en la papelera dentro de una carpeta viva parece huérfano y el `up` o el `down`
 * fallan con datos. Sin `FORCE`, el dueño de la tabla valida sobre todas las filas (hallazgo del PR #85, 011b).
 */
const withoutForcedRls = async (
  queryRunner: QueryRunner,
  work: () => Promise<void>,
): Promise<void> => {
  for (const table of VALIDATED_TABLES) {
    await queryRunner.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
  }
  await work();
  for (const table of VALIDATED_TABLES) {
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  }
};

/**
 * Un archivo o una carpeta solo cuelga de una carpeta del **mismo** propietario (spec 012 CA-14, CA-21; SEC-1 de
 * `review.md`). Desde 012 el destinatario conoce ids de carpetas ajenas, y los `WITH CHECK` de `archivo_cliente` y
 * `carpeta_cliente` (005, 006) solo miran `propietario_id`: un Lector colgaba nodos propios de la carpeta compartida y,
 * con uno en la papelera atado a ella, la purga de la propietaria fallaba por la FK de `eliminado_con_carpeta_id`.
 *
 * Se resuelve con FK compuestas `(columna, propietario_id) → carpeta (id, propietario_id)` en lugar de políticas: la
 * integridad referencial no pasa por RLS (vale para todo rol y no depende de qué carpetas ve el actor), y una política
 * de `carpeta` que consulte `carpeta` recurre sobre sí misma. `uq_carpeta_id_propietario` es la clave que exige la FK.
 * La validación de las filas existentes falla si alguna ya cuelga de una carpeta ajena: hay que corregirla antes.
 */
export class CarpetaDelMismoPropietario20261101100400 implements MigrationInterface {
  name = 'CarpetaDelMismoPropietario20261101100400';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE carpeta ADD CONSTRAINT uq_carpeta_id_propietario UNIQUE (id, propietario_id)',
    );
    await withoutForcedRls(queryRunner, async () => {
      for (const [table, column, simple, composite, action] of FOLDER_REFERENCES) {
        await queryRunner.query(`
          ALTER TABLE ${table}
            DROP CONSTRAINT ${simple},
            ADD CONSTRAINT ${composite} FOREIGN KEY (${column}, propietario_id)
              REFERENCES carpeta (id, propietario_id) ON DELETE ${onDelete(column, action)}
        `);
      }
    });
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await withoutForcedRls(queryRunner, async () => {
      for (const [table, column, simple, composite, action] of [...FOLDER_REFERENCES].reverse()) {
        await queryRunner.query(`
          ALTER TABLE ${table}
            DROP CONSTRAINT ${composite},
            ADD CONSTRAINT ${simple} FOREIGN KEY (${column}) REFERENCES carpeta (id) ON DELETE ${action}
        `);
      }
    });
    await queryRunner.query('ALTER TABLE carpeta DROP CONSTRAINT uq_carpeta_id_propietario');
  }
}
