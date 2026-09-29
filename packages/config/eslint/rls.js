import tseslint from 'typescript-eslint';

const MESSAGE =
  'No fijes el actor con SQL directo. Usa withActor para el ámbito de la transacción.';

const ACTOR_SQL = String.raw`(?:set_config\s*\(|SET\s+LOCAL\s+app\.actor_id|SET\s+app\.)`;

/** PD-26: el actor de la transacción solo se fija en el runner, a través de `withActor`. */
export default tseslint.config({
  files: ['**/*.ts'],
  ignores: ['**/shared/infrastructure/persistence/typeorm-transaction-runner.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: `Literal[value=/${ACTOR_SQL}/]`,
        message: MESSAGE,
      },
      {
        selector: `TemplateElement[value.raw=/${ACTOR_SQL}/]`,
        message: MESSAGE,
      },
    ],
  },
});
