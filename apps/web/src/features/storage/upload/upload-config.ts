/** Archivos en vuelo a la vez (plan §6 Frontend). El servidor decide si cada uno es simple o por partes (D-2). */
export const UPLOAD_FILE_CONCURRENCY = 2;

/** Partes de un mismo archivo en vuelo a la vez. */
export const UPLOAD_PART_CONCURRENCY = 4;

/** Intentos de un mismo `PUT` antes de rendirse (el primero cuenta). */
export const UPLOAD_PART_ATTEMPTS = 5;

const RETRY_BASE_DELAY_MS = 200;
const RETRY_JITTER_RATIO = 0.2;

/** Espera exponencial con hasta un 20 % de jitter antes del intento `attempt + 1` (`attempt` empieza en 1). */
export function retryDelayMs(attempt: number, random: () => number): number {
  const base = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.round(base + base * RETRY_JITTER_RATIO * random());
}
