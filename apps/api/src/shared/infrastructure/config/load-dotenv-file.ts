import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Archivo que marca la raíz del monorepo; se busca hacia arriba para valer igual en `src/` y en `dist/`. */
const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

const findRepoRoot = (from: string): string | undefined => {
  let current = from;
  for (;;) {
    if (existsSync(resolve(current, WORKSPACE_MARKER))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
};

/** Ruta del `.env` de la raíz del repositorio, o `undefined` si el código corre fuera del monorepo. */
export const repoDotenvPath = (from: string = __dirname): string | undefined => {
  const root = findRepoRoot(from);
  return root === undefined ? undefined : resolve(root, '.env');
};

/**
 * Carga el `.env` de la raíz en `process.env` (`process.loadEnvFile`, integrado en Node 22) y devuelve la
 * ruta usada. Sin archivo no hace nada ni lanza: en staging y en los contenedores las variables llegan del
 * entorno. `loadEnvFile` **no pisa** lo que ya está en `process.env`, así que el entorno siempre gana.
 *
 * Es una función, nunca un efecto de importar: solo los puntos de entrada la llaman, antes de validar
 * con `loadEnv` (plan 000 §6.2; importar `shared` sigue sin leer el entorno, CA-10).
 */
export const loadDotenvFile = (path: string | undefined = repoDotenvPath()): string | undefined => {
  if (path === undefined || !existsSync(path)) {
    return undefined;
  }
  process.loadEnvFile(path);
  return path;
};
