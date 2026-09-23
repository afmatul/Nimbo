// `pnpm env:check` (CA-19): toda variable de los esquemas de `api`, `worker` y `web` aparece en `.env.example`
// y ningún secreto usa el prefijo `NEXT_PUBLIC_` (CA-29). Falla con `1` y nombra cada problema.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Solo los esquemas (zod puro): el índice de `shared` arrastra Nest y sus decoradores, innecesarios aquí.
import {
  apiEnvSchema,
  SECRET_KEYS,
  workerEnvSchema,
} from '../apps/api/src/shared/infrastructure/config/env.schema';
import { webEnvSchema } from '../apps/web/src/env';

const PUBLIC_PREFIX = 'NEXT_PUBLIC_';
const ASSIGNMENT = /^([A-Z][A-Z0-9_]*)=/;

export interface SchemaKeys {
  readonly schemas: Readonly<Record<string, readonly string[]>>;
  readonly secrets: readonly string[];
}

export interface CheckInput extends SchemaKeys {
  readonly exampleKeys: ReadonlySet<string>;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** Claves definidas en el archivo (líneas `CLAVE=`); comentarios y líneas vacías se ignoran. */
export const parseEnvExample = (content: string): ReadonlySet<string> => {
  const keys = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const match = ASSIGNMENT.exec(line.trim());
    if (match?.[1] !== undefined) keys.add(match[1]);
  }
  return keys;
};

export const checkEnvExample = (input: CheckInput): CheckResult => {
  const problems: string[] = [];
  for (const [process, keys] of Object.entries(input.schemas)) {
    for (const key of keys) {
      if (!input.exampleKeys.has(key))
        problems.push(`\`${key}\` (${process}) falta en .env.example`);
    }
  }
  for (const key of input.exampleKeys) {
    const isLeakedSecret =
      key.startsWith(PUBLIC_PREFIX) && input.secrets.includes(key.slice(PUBLIC_PREFIX.length));
    if (isLeakedSecret) problems.push(`\`${key}\` expone un secreto al navegador (CA-19, CA-29)`);
  }
  return { ok: problems.length === 0, problems };
};

/** Las claves salen de los esquemas reales: una variable nueva sin `.env.example` rompe CI. */
export const collectSchemaKeys = (): SchemaKeys => ({
  schemas: {
    api: Object.keys(apiEnvSchema.shape),
    worker: Object.keys(workerEnvSchema.shape),
    web: Object.keys(webEnvSchema.shape),
  },
  secrets: [...SECRET_KEYS],
});

const main = (): void => {
  const exampleContent = readFileSync(join(__dirname, '..', '.env.example'), 'utf8');
  const result = checkEnvExample({
    exampleKeys: parseEnvExample(exampleContent),
    ...collectSchemaKeys(),
  });
  if (result.ok) {
    process.stdout.write('env:check: .env.example cubre los esquemas de api, worker y web\n');
    return;
  }
  process.stderr.write(`env:check: ${String(result.problems.length)} problema(s)\n`);
  for (const problem of result.problems) process.stderr.write(`  - ${problem}\n`);
  process.exitCode = 1;
};

if (require.main === module) {
  main();
}
