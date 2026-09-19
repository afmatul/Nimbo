// `pnpm --filter api migration:generate -- <verbo-objeto>` → `src/migrations/<YYYYMMDDHHmmss>-<verbo-objeto>.ts`.
// Ejecuta la CLI de TypeORM bajo `tsx` para que cargue `data-source.cli.ts` sin compilar (conventions.md §BD).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const name = process.argv[2];
if (name === undefined || !NAME_PATTERN.test(name)) {
  process.stderr.write(
    'Uso: pnpm --filter api migration:generate -- <verbo-objeto> (kebab-case, p. ej. crear-archivo)\n',
  );
  process.exit(2);
}

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const timestamp = [
  now.getUTCFullYear(),
  pad(now.getUTCMonth() + 1),
  pad(now.getUTCDate()),
  pad(now.getUTCHours()),
  pad(now.getUTCMinutes()),
  pad(now.getUTCSeconds()),
].join('');

const require = createRequire(import.meta.url);
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [
    require.resolve('tsx/cli'),
    require.resolve('typeorm/cli.js'),
    'migration:generate',
    '-d',
    'src/migrations/data-source.cli.ts',
    '-t',
    timestamp,
    `src/migrations/${name}`,
  ],
  { cwd: apiRoot, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
