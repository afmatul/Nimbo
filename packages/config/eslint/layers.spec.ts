import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { parser, plugin } from 'typescript-eslint';

import boundaries from './boundaries.js';
import layers from './layers.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

const DOMAIN_FILE = 'apps/api/src/modules/storage/domain/errors/x.ts';
const SHARED_DOMAIN_FILE = 'apps/api/src/shared/domain/x.ts';
const APPLICATION_FILE = 'apps/api/src/modules/storage/application/ports/x.ts';
const SUBFOLDER_DOMAIN_FILE = 'apps/api/src/modules/storage/preview/domain/x.ts';
const SUBFOLDER_APPLICATION_FILE = 'apps/api/src/modules/storage/search/application/ports/x.ts';
const DOMAIN_SPEC_FILE = 'apps/api/src/modules/storage/domain/x.spec.ts';

const lint = async (specifier: string, relativePath: string): Promise<ESLint.LintResult> => {
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser },
        plugins: { '@typescript-eslint': plugin },
      },
      ...boundaries,
      ...layers,
    ],
  });
  const code = `export { Algo } from '${specifier}';\n`;
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, relativePath) });
  if (result === undefined) throw new Error('ESLint no devolvió resultado');
  return result;
};

const errorsOf = async (
  specifier: string,
  relativePath: string,
  ruleId = '@typescript-eslint/no-restricted-imports',
): Promise<readonly string[]> =>
  (await lint(specifier, relativePath)).messages
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);

describe('lint layers.js: capas dentro de cada módulo (CA-6, Art. VIII.2)', () => {
  it.each([
    ['@nestjs/common'],
    ['typeorm'],
    ['zod'],
    ['class-validator'],
    ['@nimbo/contracts'],
    ['../../application/upload.service'],
    ['../../infrastructure/persistence/archivo.orm-entity'],
    ['../../presentation/uploads.controller'],
    ['../../../../shared'],
    ['../../../../shared/infrastructure/config/env.schema'],
  ])('CA-6: `domain` no importa `%s`', async (specifier) => {
    const errors = await errorsOf(specifier, DOMAIN_FILE);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('`domain`');
  });

  it.each([
    ['./file-name.vo'],
    ['../index'],
    ['../../../../shared/domain/errors'],
    ['node:crypto'],
  ])('CA-6: `domain` sí importa `%s`', async (specifier) => {
    expect(await errorsOf(specifier, DOMAIN_FILE)).toEqual([]);
  });

  it('CA-6: `shared/domain` tampoco importa frameworks', async () => {
    expect(await errorsOf('@nestjs/common', SHARED_DOMAIN_FILE)).toHaveLength(1);
  });

  it('CA-6: las pruebas de `domain` sí usan contratos y librerías', async () => {
    expect(await errorsOf('@nimbo/contracts', DOMAIN_SPEC_FILE)).toEqual([]);
  });

  it.each([['../../infrastructure/minio-storage.adapter'], ['../../presentation/dto']])(
    'CA-6: `application` no importa `%s`',
    async (specifier) => {
      const errors = await errorsOf(specifier, APPLICATION_FILE);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('`application`');
    },
  );

  it.each([['../../domain/file'], ['@nestjs/common'], ['../../../access']])(
    'CA-6: `application` sí importa `%s`',
    async (specifier) => {
      expect(await errorsOf(specifier, APPLICATION_FILE)).toEqual([]);
    },
  );

  it('CA-5 + CA-6: las capas no apagan las fronteras entre módulos', async () => {
    expect(
      await errorsOf('../../../sharing', APPLICATION_FILE, 'no-restricted-imports'),
    ).toHaveLength(1);
  });

  it('PD-151: las capas también rigen en subcarpetas con capas propias (`storage/search`)', async () => {
    const application = await errorsOf(
      '../../infrastructure/typeorm-node-search.repository',
      SUBFOLDER_APPLICATION_FILE,
    );
    const domain = await errorsOf('@nestjs/common', SUBFOLDER_DOMAIN_FILE);

    expect(application).toHaveLength(1);
    expect(application[0]).toContain('`application`');
    expect(domain).toHaveLength(1);
    expect(domain[0]).toContain('`domain`');
  });

  it('PD-151: `storage/search/application` sí importa su dominio y `@nestjs/common`', async () => {
    expect(await errorsOf('../../domain/x', SUBFOLDER_APPLICATION_FILE)).toEqual([]);
    expect(await errorsOf('@nestjs/common', SUBFOLDER_APPLICATION_FILE)).toEqual([]);
  });
});
