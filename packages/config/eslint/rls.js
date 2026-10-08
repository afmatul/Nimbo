import tseslint from 'typescript-eslint';

const MESSAGE =
  'No fijes el actor con SQL directo. Usa withActor para el ámbito de la transacción.';

const ACTOR_SQL = String.raw`(?:set_config\s*\(|SET\s+LOCAL\s+app\.actor_id|SET\s+app\.)`;

/**
 * Selectores de `no-restricted-syntax`. Se exportan porque una configuración posterior que use la misma regla la
 * reemplaza entera: `typeorm-columns.js` los repite para no apagar este control en las entidades.
 */
export const RLS_RESTRICTED_SYNTAX = [
  { selector: `Literal[value=/${ACTOR_SQL}/]`, message: MESSAGE },
  { selector: `TemplateElement[value.raw=/${ACTOR_SQL}/]`, message: MESSAGE },
];

/** PD-26: el actor de la transacción solo se fija en el runner, a través de `withActor`. */
export default tseslint.config({
  files: ['**/*.ts'],
  ignores: ['**/shared/infrastructure/persistence/typeorm-transaction-runner.ts'],
  rules: {
    'no-restricted-syntax': ['error', ...RLS_RESTRICTED_SYNTAX],
  },
});
