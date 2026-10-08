import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { parser as typescriptParser } from 'typescript-eslint';

import typeormColumns from './typeorm-columns.js';

const here = dirname(fileURLToPath(import.meta.url));
const ENTITY_FILE = 'apps/api/src/modules/storage/infrastructure/persistence/x.orm-entity.ts';

const entity = (decorator: string, property: string): string => `class Entidad {
  ${decorator}
  ${property}!: bigint;
}
export { Entidad };
`;

const syntaxErrors = async (code: string): Promise<readonly string[]> => {
  const eslint = new ESLint({
    cwd: here,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: typescriptParser } },
      ...typeormColumns,
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: join(here, ENTITY_FILE) });
  if (result === undefined) throw new Error('ESLint no devolvió resultado');
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
};

describe('lint typeorm-columns.js: bytes en bigint y dinero en centavos enteros (DF-06, DF-23)', () => {
  it.each([
    ["@Column('int', { name: 'tamano_bytes' })", 'tamanoBytes'],
    ["@Column({ type: 'integer', name: 'cuota_bytes' })", 'cuotaBytes'],
    ["@Column('numeric', { name: 'precio_centavos' })", 'precioCentavos'],
    ["@Column({ type: 'decimal', name: 'monto_cents' })", 'amountCents'],
  ])('DF-06/DF-23: `%s %s` falla', async (decorator, property) => {
    expect(await syntaxErrors(entity(decorator, property))).toHaveLength(1);
  });

  it.each([
    ["@Column('bigint', { name: 'tamano_bytes' })", 'tamanoBytes'],
    ["@Column({ type: 'bigint', name: 'cuota_bytes' })", 'cuotaBytes'],
    ["@Column('bigint', { name: 'precio_centavos' })", 'precioCentavos'],
    ["@Column('int', { name: 'profundidad' })", 'profundidad'],
  ])('DF-06/DF-23: `%s %s` pasa', async (decorator, property) => {
    expect(await syntaxErrors(entity(decorator, property))).toEqual([]);
  });

  it('PD-26: la regla de RLS sigue activa en las entidades', async () => {
    const code = "export const sql = 'SELECT set_config($1, $2, true)';\n";

    expect(await syntaxErrors(code)).toHaveLength(1);
  });
});
