import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { parser as typescriptParser } from 'typescript-eslint';

import boundaries from './boundaries.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

const STORAGE_PORT = 'apps/api/src/modules/storage/application/ports/i-node.repository.port.ts';
const STORAGE_PLAN_LIMITS = 'apps/api/src/modules/storage/application/plan-limits.ts';
const STORAGE_REPOSITORY =
  'apps/api/src/modules/storage/infrastructure/persistence/typeorm-node.repository.ts';
const BILLING_FILE = 'apps/api/src/modules/billing/infrastructure/plan-limits.provider.ts';
const ACCESS_FILE = 'apps/api/src/modules/access/infrastructure/sql/accessible-nodes.ts';
const AUDIT_FILE = 'apps/api/src/modules/audit/application/audit-logger.port.ts';
const BACKOFFICE_FILE = 'apps/api/src/modules/backoffice/application/internal-action.service.ts';
const WORKER_MODULE = 'apps/api/src/worker.module.ts';

const fixture = (name: string): string => readFileSync(join(here, 'fixtures', name), 'utf8');

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

const boundaryErrors = (result: ESLint.LintResult): readonly string[] =>
  result.messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);

const importOf = (specifier: string, name = 'Algo'): string =>
  `export { ${name} } from '${specifier}';\n`;

describe('lint boundaries.js: fronteras de storage, access, audit, billing y backoffice (Art. VIII, PD-47, PD-82)', () => {
  it('Art. VIII: el fixture `storage-imports-identity.ts` es error (DF-59 no es una arista)', async () => {
    const errors = boundaryErrors(await lint(fixture('storage-imports-identity.ts'), STORAGE_PORT));

    expect(errors).toHaveLength(2);
    expect(errors.every((message) => message.includes('`storage`'))).toBe(true);
  });

  it('Art. VIII: el fixture `storage-imports-billing.ts` es error, también en `plan-limits.ts` (DF-51)', async () => {
    const errors = boundaryErrors(
      await lint(fixture('storage-imports-billing.ts'), STORAGE_PLAN_LIMITS),
    );

    expect(errors).toHaveLength(2);
  });

  it.each([
    ['sharing', '../../../sharing'],
    ['notifications', '../../../notifications'],
    ['identity por modules/', '../../../../modules/identity'],
  ])('Art. VIII: `storage` no importa %s', async (_, specifier) => {
    expect(boundaryErrors(await lint(importOf(specifier), STORAGE_REPOSITORY))).toHaveLength(1);
  });

  it.each([
    ['shared', '../../../../shared'],
    ['access (fachada)', '../../../access'],
    ['audit (fachada)', '../../../audit'],
    ['realtime (fachada)', '../../../realtime'],
    ['su propio dominio', '../../domain/file'],
    ['los contratos', '@nimbo/contracts'],
  ])('Art. VIII: `storage` sí importa %s', async (_, specifier) => {
    expect(boundaryErrors(await lint(importOf(specifier), STORAGE_REPOSITORY))).toEqual([]);
  });

  it.each([
    ['access', '../../../access/infrastructure/sql/accessible-nodes'],
    ['audit', '../../../audit/application/audit-logger.port'],
  ])(
    'Art. VIII.3: `storage` importa %s solo desde su `index.ts`, no por dentro',
    async (_, specifier) => {
      expect(boundaryErrors(await lint(importOf(specifier), STORAGE_REPOSITORY))).toHaveLength(1);
    },
  );

  it('DF-51: `billing` importa `storage` solo desde `storage/index.ts`', async () => {
    const viaIndex = await lint(importOf('../../storage', 'I_PLAN_LIMITS_PROVIDER'), BILLING_FILE);
    const deep = await lint(importOf('../../storage/application/plan-limits'), BILLING_FILE);

    expect(boundaryErrors(viaIndex)).toEqual([]);
    expect(boundaryErrors(deep)).toHaveLength(1);
  });

  it('009: `billing` importa `identity` solo desde `identity/index.ts` (evento y fachadas, no repositorios)', async () => {
    const viaIndex = await lint(importOf('../../identity', 'VerifiedClientLister'), BILLING_FILE);
    const deep = await lint(
      importOf('../../identity/application/ports/i-account-directory.repository.port'),
      BILLING_FILE,
    );

    expect(boundaryErrors(viaIndex)).toEqual([]);
    expect(boundaryErrors(deep)).toHaveLength(1);
  });

  it.each([
    ['access', ACCESS_FILE, '../../../storage'],
    ['access', ACCESS_FILE, '../../../identity'],
    ['audit', AUDIT_FILE, '../../identity'],
    ['audit', AUDIT_FILE, '../../storage'],
  ])('Art. VIII: `%s` solo importa `shared` (%s → %s es error)', async (_, file, specifier) => {
    expect(boundaryErrors(await lint(importOf(specifier), file))).toHaveLength(1);
  });

  it.each([
    ['access', ACCESS_FILE, '../../../../shared'],
    ['audit', AUDIT_FILE, '../../../shared'],
  ])('Art. VIII: `%s` sí importa `shared`', async (_, file, specifier) => {
    expect(boundaryErrors(await lint(importOf(specifier), file))).toEqual([]);
  });

  it('PD-82: el fixture `backoffice-imports-identity-internals.ts` es error: `identity` solo por su `index.ts`', async () => {
    const errors = boundaryErrors(
      await lint(fixture('backoffice-imports-identity-internals.ts'), BACKOFFICE_FILE),
    );

    expect(errors).toHaveLength(2);
    expect(errors.every((message) => message.includes('index.ts'))).toBe(true);
  });

  it('PD-82: el fixture `audit-imports-identity.ts` es error: `audit` no tiene aristas', async () => {
    const errors = boundaryErrors(await lint(fixture('audit-imports-identity.ts'), AUDIT_FILE));

    expect(errors).toHaveLength(2);
    expect(errors.every((message) => message.includes('`audit`'))).toBe(true);
  });

  it('plan §3b: el worker importa de `storage` solo `StorageWorkerModule` desde `storage/index.ts`', async () => {
    const allowed = await lint(importOf('./modules/storage', 'StorageWorkerModule'), WORKER_MODULE);
    const otherName = await lint(importOf('./modules/storage', 'StorageModule'), WORKER_MODULE);
    const deep = await lint(importOf('./modules/storage/infrastructure/worker'), WORKER_MODULE);

    expect(boundaryErrors(allowed)).toEqual([]);
    expect(boundaryErrors(otherName)).toHaveLength(1);
    expect(boundaryErrors(deep)).toHaveLength(1);
  });
});
