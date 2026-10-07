import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { flatConfigs as importXConfigs } from 'eslint-plugin-import-x';
import { parser as typescriptParser } from 'typescript-eslint';

import cycles from './cycles.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, 'fixtures');

const cycleErrors = async (relativePath: string): Promise<readonly string[]> => {
  const eslint = new ESLint({
    cwd: FIXTURES,
    overrideConfigFile: true,
    overrideConfig: [
      importXConfigs.recommended,
      importXConfigs.typescript,
      {
        files: ['**/*.ts'],
        languageOptions: { parser: typescriptParser },
        settings: { 'import-x/resolver-next': [createTypeScriptImportResolver()] },
        rules: { 'import-x/no-unresolved': 'off', 'import-x/named': 'off' },
      },
      ...cycles,
    ],
  });
  const [result] = await eslint.lintFiles([join(FIXTURES, relativePath)]);
  if (result === undefined) throw new Error('ESLint no devolvió resultado');
  const lines = readFileSync(join(FIXTURES, relativePath), 'utf8').split('\n');
  // El mensaje de import-x no nombra el módulo: lo identifica la línea del `import` que cierra el ciclo.
  return result.messages
    .filter((message) => message.ruleId === 'import-x/no-cycle')
    .map((message) => `${message.message}: ${lines[message.line - 1] ?? ''}`);
};

describe('lint cycles.js: ciclos entre módulos (CA-7, Art. VIII.4)', () => {
  it.each([
    ['cycle-a/index.ts', 'cycle-b'],
    ['cycle-b/index.ts', 'cycle-a'],
  ])('CA-7: `%s` falla y nombra el módulo del ciclo (%s)', async (file, other) => {
    const errors = await cycleErrors(file);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(other);
  });

  it('CA-7: importar un módulo sin cerrar el ciclo pasa', async () => {
    expect(await cycleErrors('no-cycle.ts')).toEqual([]);
  });
});
