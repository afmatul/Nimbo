import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const ESLINT_BIN = join(ROOT, 'node_modules/eslint/bin/eslint.js');
const RULE = 'no-restricted-imports';
/** Archivos reales: el lint tipado solo acepta rutas que conoce el `tsconfig` de `api`. */
const SHARED_FILE = 'apps/api/src/shared/presentation/zod-validation.pipe.ts';
const OUTSIDE_SHARED_FILE = 'apps/api/src/app.module.ts';
/** Lint tipado de un proceso nuevo por caso: arranca el servicio de proyectos de TypeScript. */
const LINT_TIMEOUT_MS = 60_000;

interface LintMessage {
  readonly ruleId: string | null;
  readonly fatal?: boolean;
  readonly message: string;
}

/** Corre el ESLint del repositorio (configuración raíz real) sobre `source` como si fuera `filePath`. */
function restrictedImportsIn(source: string, filePath: string): number {
  const result = spawnSync(
    process.execPath,
    [ESLINT_BIN, '--stdin', '--stdin-filename', filePath, '--format', 'json'],
    { cwd: ROOT, input: source, encoding: 'utf8' },
  );
  const [report] = JSON.parse(result.stdout) as { messages: LintMessage[] }[];
  const messages = report?.messages ?? [];
  const fatal = messages.find((message) => message.fatal === true);
  if (fatal) throw new Error(`ESLint no pudo analizar el caso: ${fatal.message}`);
  return messages.filter((message) => message.ruleId === RULE).length;
}

describe('ADR-0020: `apps/api/src/shared` no importa contratos de módulos', () => {
  jest.setTimeout(LINT_TIMEOUT_MS);

  it.each([
    [
      'un nombre de `identity` desde la raíz de `@nimbo/contracts`',
      "import { evaluatePassword } from '@nimbo/contracts';\nexport const f = evaluatePassword;\n",
    ],
    [
      'la subruta `@nimbo/contracts/identity`',
      "import { evaluatePassword } from '@nimbo/contracts/identity';\nexport const f = evaluatePassword;\n",
    ],
    [
      'la carpeta `identity` de `packages/contracts` por ruta relativa',
      "import { evaluatePassword } from '../../../../../packages/contracts/src/identity';\nexport const f = evaluatePassword;\n",
    ],
    [
      'un espacio de nombres de toda la raíz',
      "import * as contracts from '@nimbo/contracts';\nexport const c = contracts;\n",
    ],
  ])('rechaza %s', (_case, source) => {
    expect(restrictedImportsIn(source, SHARED_FILE)).toBeGreaterThan(0);
  });

  it('permite los contratos raíz (`toFieldIssues`, `ErrorResponse`, salud)', () => {
    const source = [
      "import type { ErrorResponse, HealthCheckName } from '@nimbo/contracts';",
      "import { toFieldIssues } from '@nimbo/contracts';",
      'export const f = toFieldIssues;',
      'export type T = [ErrorResponse, HealthCheckName];',
      '',
    ].join('\n');

    expect(restrictedImportsIn(source, SHARED_FILE)).toBe(0);
  });

  it('no restringe a los módulos fuera de `shared`', () => {
    const source =
      "import { evaluatePassword } from '@nimbo/contracts';\nexport const f = evaluatePassword;\n";

    expect(restrictedImportsIn(source, OUTSIDE_SHARED_FILE)).toBe(0);
  });
});
