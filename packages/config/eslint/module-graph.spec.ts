import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { parser as typescriptParser } from 'typescript-eslint';

import boundaries from './boundaries.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

/** Grafo de `architecture.md` §3 (ADR-0010): cada módulo y los módulos cuya fachada puede importar. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  audit: [],
  realtime: [],
  notifications: ['realtime'],
  identity: ['notifications', 'audit', 'editing', 'sharing'],
  billing: ['notifications', 'audit', 'storage', 'identity'],
  access: [],
  storage: ['access', 'audit', 'realtime'],
  sharing: ['access', 'storage', 'audit'],
  editing: ['storage', 'access', 'realtime', 'audit'],
  intelligence: ['storage', 'access', 'billing', 'realtime', 'audit'],
  optimizer: ['storage', 'access', 'audit'],
  backoffice: ['audit', 'identity', 'billing', 'storage'],
};

const MODULES = Object.keys(ALLOWED);

const fileOf = (module: string): string => `apps/api/src/modules/${module}/application/caso.ts`;

const lint = async (code: string, relativePath: string): Promise<ESLint.LintResult> => {
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: typescriptParser } },
      ...boundaries,
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, relativePath) });
  if (result === undefined) throw new Error('ESLint no devolvió resultado');
  return result;
};

const boundaryErrors = async (code: string, relativePath: string): Promise<readonly string[]> =>
  (await lint(code, relativePath)).messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);

const importOf = (specifier: string): string => `export { Algo } from '${specifier}';\n`;

const fixture = (name: string): string => readFileSync(join(here, 'fixtures', name), 'utf8');

const allowedPairs = MODULES.flatMap((from) => ALLOWED[from]?.map((to) => [from, to]) ?? []);
const forbiddenPairs = MODULES.flatMap((from) =>
  MODULES.filter((to) => to !== from && !ALLOWED[from]?.includes(to)).map((to) => [from, to]),
);

describe('lint boundaries.js: grafo completo de módulos (CA-5, ADR-0010, PD-24)', () => {
  it.each(allowedPairs)('CA-5: `%s` sí importa la fachada de `%s`', async (from, to) => {
    expect(await boundaryErrors(importOf(`../../${to}`), fileOf(from))).toEqual([]);
  });

  it.each(allowedPairs)(
    'CA-5: `%s` no entra por dentro de `%s` (solo su `index.ts`)',
    async (from, to) => {
      const errors = await boundaryErrors(importOf(`../../${to}/domain/x`), fileOf(from));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('index.ts');
    },
  );

  it.each(forbiddenPairs)('CA-5: `%s` no importa `%s`', async (from, to) => {
    const errors = await boundaryErrors(importOf(`../../${to}`), fileOf(from));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`\`${from}\``);
  });

  it.each(MODULES)('CA-5: `%s` sí importa `shared` y sus propios archivos', async (module) => {
    const code = `${importOf('../../../shared')}${importOf('../domain/x')}`;

    expect(await boundaryErrors(code, fileOf(module))).toEqual([]);
  });

  it.each([
    ['realtime-imports-identity.ts', 'realtime', 2],
    ['access-imports-storage.ts', 'access', 2],
    ['identity-imports-billing.ts', 'identity', 1],
    ['editing-imports-billing.ts', 'editing', 1],
    ['intelligence-imports-billing.ts', 'intelligence', 1],
  ])('PD-24: el fixture `%s` es error en `%s`', async (name, module, count) => {
    expect(await boundaryErrors(fixture(name), fileOf(module))).toHaveLength(count);
  });
});
