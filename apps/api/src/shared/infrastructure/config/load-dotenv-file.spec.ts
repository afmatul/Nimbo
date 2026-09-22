import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { loadDotenvFile, repoDotenvPath } from './load-dotenv-file';

let directorio: string;

beforeEach(() => {
  directorio = mkdtempSync(resolve(tmpdir(), 'nimbo-dotenv-'));
});

afterEach(() => {
  rmSync(directorio, { recursive: true, force: true });
});

/**
 * Lo que `loadDotenvFile` escribe en el entorno no se observa desde Jest: `process.loadEnvFile` es nativo y
 * escribe en el entorno real del proceso, mientras que el ambiente de Jest expone una copia de `process.env`.
 * La carga y la precedencia se comprueban en subprocesos reales (`test/int/shared/dotenv-bootstrap.int-spec.ts`).
 */
describe('loadDotenvFile', () => {
  it('CA-1: sin archivo no lanza y devuelve `undefined`', () => {
    const inexistente = resolve(directorio, '.env');

    expect(() => loadDotenvFile(inexistente)).not.toThrow();
    expect(loadDotenvFile(inexistente)).toBeUndefined();
  });

  it('CA-1: por defecto apunta al `.env` de la raíz del repositorio, no al de `apps/api`', () => {
    expect(repoDotenvPath()).toBe(resolve(__dirname, '../../../../../..', '.env'));
  });

  it('CA-1: la ruta por defecto se resuelve igual desde `src/` que desde `dist/` (misma profundidad)', () => {
    const desdeDist = resolve(
      __dirname,
      '../../../../../..',
      'apps/api/dist/shared/infrastructure/config',
    );

    expect(repoDotenvPath(desdeDist)).toBe(repoDotenvPath());
  });

  it('CA-1: fuera del repositorio (sin marcador de workspace) no hay ruta por defecto', () => {
    expect(repoDotenvPath(directorio)).toBeUndefined();
  });
});
