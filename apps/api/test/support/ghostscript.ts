import { spawnSync } from 'node:child_process';

/**
 * Ghostscript de las pruebas de integración (019 T-04, T-06). El binario sale de `GHOSTSCRIPT_BIN` (en Windows, la ruta
 * de `gswin64c.exe`, `docs/operations/ambientes.md`). En CI es obligatorio: si falta, las pruebas fallan; solo en una
 * máquina de desarrollo sin Ghostscript se omiten, para no bloquear el resto de `test:int`.
 */
export const GHOSTSCRIPT_BIN =
  process.env.GHOSTSCRIPT_BIN ?? (process.platform === 'win32' ? 'gswin64c' : 'gs');

const runsWithGhostscript =
  spawnSync(GHOSTSCRIPT_BIN, ['--version']).status === 0 || process.env.CI === 'true';

export const describeWithGhostscript = runsWithGhostscript ? describe : describe.skip;
export const itWithGhostscript = runsWithGhostscript ? it : it.skip;
