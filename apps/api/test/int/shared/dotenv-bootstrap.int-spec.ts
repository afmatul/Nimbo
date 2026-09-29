import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { compiledEntry } from '../setup/compiled-api';

const API_ROOT = resolve(__dirname, '../../..');
const REPO_ROOT = resolve(API_ROOT, '../..');
const DOTENV = resolve(REPO_ROOT, '.env');
const TEST_PORT = 3997;
const LIVE_URL = `http://127.0.0.1:${String(TEST_PORT)}/api/v1/health/live`;
const BOOT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

/**
 * Entorno de un integrante nuevo: ninguna variable de la aplicación definida, solo lo que el sistema
 * operativo necesita para ejecutar Node y abrir sockets. `PORT` va explícito para no chocar con la `api`
 * de `pnpm dev`; que gane sobre el archivo también demuestra la precedencia del entorno sobre el `.env`.
 */
const cleanEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  SystemDrive: process.env.SystemDrive,
  TEMP: process.env.TEMP,
  PORT: String(TEST_PORT),
});

const liveResponds = async (): Promise<boolean> => {
  try {
    const response = await fetch(LIVE_URL);
    return response.status === 200;
  } catch {
    return false;
  }
};

interface StartedProcess {
  readonly child: ChildProcessWithoutNullStreams;
  stderr(): string;
  exited(): boolean;
}

const startApi = (): StartedProcess => {
  const child = spawn(process.execPath, [compiledEntry('main')], {
    cwd: API_ROOT,
    env: cleanEnv(),
  });
  let stderr = '';
  let exited = false;
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  child.on('exit', () => {
    exited = true;
  });
  return { child, stderr: () => stderr, exited: () => exited };
};

const stopApi = async (started: StartedProcess): Promise<void> => {
  if (started.exited()) return;
  started.child.kill();
  await delay(POLL_INTERVAL_MS);
};

/**
 * El defecto que cubre esta suite: el README manda `cp .env.example .env` y arrancar, pero ningún punto de
 * entrada leía el archivo y todo moría con `config.invalid`. El proceso es el `api` compilado con `tsc`
 * (`compiled-api.ts`; con `tsx` la inyección por tipo de Nest falla). Se comprueba `health/live` y no
 * `health/ready` porque las dependencias del `.env` son las de `docker compose` y no las del arnés; la salud
 * completa ya la cubre `health.int-spec.ts`.
 */
describe('arranque según el README (CA-1)', () => {
  it('CA-1: con solo el `.env` de la raíz, `api` arranca y `health/live` responde 200 (sin `config.invalid`)', async () => {
    expect(existsSync(DOTENV)).toBe(true);
    const started = startApi();

    try {
      const limite = Date.now() + BOOT_TIMEOUT_MS;
      let vivo = false;
      while (!vivo && Date.now() < limite && !started.exited()) {
        vivo = await liveResponds();
        if (!vivo) await delay(POLL_INTERVAL_MS);
      }

      expect(started.stderr()).not.toContain('config.invalid');
      expect(started.exited()).toBe(false);
      expect(vivo).toBe(true);
    } finally {
      await stopApi(started);
    }
  }, 120_000);
});

/** El efecto de `process.loadEnvFile` solo se ve en un proceso real: el ambiente de Jest copia `process.env`. */
describe('loadDotenvFile en un proceso real (CA-1)', () => {
  const HELPER = resolve(API_ROOT, 'src/shared/infrastructure/config/load-dotenv-file.ts');
  const VARIABLE = 'NIMBO_PRUEBA_DOTENV';
  const OTRA = 'NIMBO_PRUEBA_DOTENV_2';

  const leerEnvTrasCargar = (
    entorno: NodeJS.ProcessEnv,
  ): { readonly variable?: string; readonly otra?: string } => {
    const directorio = mkdtempSync(resolve(tmpdir(), 'nimbo-dotenv-'));
    try {
      const archivo = resolve(directorio, '.env');
      writeFileSync(
        archivo,
        `${VARIABLE}=desde-archivo
${OTRA}=otra
`,
        'utf8',
      );
      const guion = resolve(directorio, 'cargar.ts');
      writeFileSync(
        guion,
        `import { loadDotenvFile } from ${JSON.stringify(HELPER)};
` +
          `loadDotenvFile(${JSON.stringify(archivo)});
` +
          `process.stdout.write(JSON.stringify({ variable: process.env.${VARIABLE}, otra: process.env.${OTRA} }));
`,
        'utf8',
      );
      const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), guion], {
        cwd: API_ROOT,
        env: { ...cleanEnv(), ...entorno },
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(result.stderr).toBe('');
      return JSON.parse(result.stdout) as { variable?: string; otra?: string };
    } finally {
      rmSync(directorio, { recursive: true, force: true });
    }
  };

  it('CA-1: carga en `process.env` las variables del archivo indicado', () => {
    expect(leerEnvTrasCargar({})).toEqual({ variable: 'desde-archivo', otra: 'otra' });
  });

  it('CA-1: no pisa una variable ya presente en el entorno (mandan staging y los contenedores)', () => {
    expect(leerEnvTrasCargar({ [VARIABLE]: 'desde-el-entorno' })).toEqual({
      variable: 'desde-el-entorno',
      otra: 'otra',
    });
  });
});
