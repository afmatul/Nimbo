import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { parser as typescriptParser } from 'typescript-eslint';

import rls from './rls.js';

const here = dirname(fileURLToPath(import.meta.url));

const ALLOWED_FILE = 'apps/api/src/shared/infrastructure/persistence/typeorm-transaction-runner.ts';
const OTHER_FILE = 'apps/api/src/storage/infrastructure/persistence/typeorm-file.repository.ts';

const SET_CONFIG_CALL = `export const fix = (query: (sql: string) => unknown): unknown =>
  query('SELECT set_config($1, $2, true)');
`;
const SET_LOCAL_TEMPLATE = `export const fix = (query: (sql: string) => unknown, id: string): unknown =>
  query(\`SET LOCAL app.actor_id = '\${id}'\`);
`;
const SET_APP_LITERAL = `export const fix = (query: (sql: string) => unknown): unknown =>
  query("SET app.actor_role = 'CLIENT'");
`;

const lint = async (code: string, relativePath: string): Promise<ESLint.LintResult> => {
  const eslint = new ESLint({
    cwd: here,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.ts'], languageOptions: { parser: typescriptParser } }, ...rls],
  });
  const [result] = await eslint.lintText(code, { filePath: join(here, relativePath) });
  if (result === undefined) throw new Error('ESLint no devolvió resultado');
  return result;
};

const restrictedMessages = (result: ESLint.LintResult): readonly string[] =>
  result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);

describe('lint rls.js: el actor en SQL solo lo fija withActor (CA-12, PD-26)', () => {
  it.each([
    ['set_config(', SET_CONFIG_CALL],
    ['plantilla SET LOCAL app.actor_id', SET_LOCAL_TEMPLATE],
    ['literal SET app.', SET_APP_LITERAL],
  ])(
    'CA-12: %s fuera de typeorm-transaction-runner.ts es error que nombra withActor',
    async (_, code) => {
      const result = await lint(code, OTHER_FILE);

      const messages = restrictedMessages(result);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(messages).not.toHaveLength(0);
      expect(messages.every((m) => m.includes('withActor'))).toBe(true);
    },
  );

  it.each([
    ['set_config(', SET_CONFIG_CALL],
    ['plantilla SET LOCAL app.actor_id', SET_LOCAL_TEMPLATE],
    ['literal SET app.', SET_APP_LITERAL],
  ])('CA-12: %s en typeorm-transaction-runner.ts pasa', async (_, code) => {
    const result = await lint(code, ALLOWED_FILE);

    expect(result.messages).toEqual([]);
  });

  it('CA-12: un SQL sin fijar el actor no se marca', async () => {
    const result = await lint(
      `export const ok = (query: (sql: string) => unknown): unknown => query('SELECT 1');\n`,
      OTHER_FILE,
    );

    expect(result.messages).toEqual([]);
  });
});
