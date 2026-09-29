import type { LogLine, LogSink } from './log-sink';

const WAIT_STEP_MS = 50;
const DEFAULT_WAIT_MS = 30_000;

/** Espera la primera línea que cumpla `predicate` (p. ej. las del `worker` compuesto en la misma app). */
export const waitForLog = async (
  logs: LogSink,
  predicate: (line: LogLine) => boolean,
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<LogLine> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = logs.lines().find(predicate);
    if (found !== undefined) return found;
    if (Date.now() >= deadline) {
      throw new Error(`Ninguna línea de bitácora cumplió la condición en ${String(timeoutMs)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
};
