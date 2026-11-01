import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const API_ROOT = resolve(__dirname, '../../..');

/** Salida de la compilación de las pruebas; fuera de `dist/` para no pisar `nest build` ni `pnpm dev`. */
const COMPILED_API_DIR = resolve(API_ROOT, 'dist-int');

/** Puntos de entrada que las suites arrancan como proceso real. */
export type ApiEntry = 'main' | 'worker.main' | 'worker-optimizer.main';

/**
 * Compila `api` con `tsc` (una vez por corrida, desde `globalSetup`). Las suites que arrancan `api` o `worker` como
 * proceso usan esta salida y no `tsx`: esbuild no emite `design:paramtypes` y la inyección por tipo de Nest falla
 * (plan 000 §9 R-3). `dist-int` queda dentro del monorepo para que `loadDotenvFile` encuentre el `.env` de la raíz,
 * y se vacía antes para que no sobrevivan archivos de fuentes ya borradas (p. ej. migraciones).
 */
export const compileApi = (): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    rmSync(COMPILED_API_DIR, { recursive: true, force: true });
    const child = spawn(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '-p',
        'tsconfig.build.json',
        '--outDir',
        COMPILED_API_DIR,
      ],
      { cwd: API_ROOT },
    );
    let output = '';
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`tsc no compiló api (código ${String(code)}):\n${output}`));
    });
  });

/** Ruta del punto de entrada compilado por `compileApi`, para `node <ruta>`. */
export const compiledEntry = (entry: ApiEntry): string => resolve(COMPILED_API_DIR, `${entry}.js`);
