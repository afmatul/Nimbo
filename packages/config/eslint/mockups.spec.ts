import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { parser as typescriptParser } from 'typescript-eslint';

import mockups from './mockups.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');
const WEB_FILE = 'apps/web/src/features/storage/components/pantalla.tsx';

const mockupErrors = async (specifier: string): Promise<readonly string[]> => {
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.{ts,tsx}'], languageOptions: { parser: typescriptParser } },
      ...mockups,
    ],
  });
  const code = `export { Pantalla } from '${specifier}';\n`;
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, WEB_FILE) });
  if (result === undefined) throw new Error('ESLint no devolvió resultado');
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
};

describe('lint mockups.js: `apps/web` no importa mockups (CA-8)', () => {
  it.each([
    ['ruta relativa', '../../../../../../docs/design/mockups/storage/explorador'],
    ['alias', '@mockups/storage/explorador'],
  ])('CA-8: importar un mockup por %s falla', async (_, specifier) => {
    const errors = await mockupErrors(specifier);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Los mockups son solo referencia');
  });

  it('CA-8: importar un componente propio pasa', async () => {
    expect(await mockupErrors('../../../components/nimbo/upload-progress')).toEqual([]);
  });
});
