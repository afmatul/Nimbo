/** Cuántas miniaturas se leen a la vez: cada una abre su lector (pdf.js, imagen) y una carpeta puede tener decenas. */
const MAX_CONCURRENT = 3;

let active = 0;
const waiting: Array<() => void> = [];

function next(): void {
  const start = waiting.shift();
  if (start === undefined) return;
  active += 1;
  start();
}

/** Espera su turno; devuelve cómo liberarlo (idempotente) o `null` si se canceló antes de empezar. */
export function acquireThumbnailSlot(signal: AbortSignal): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }
    const start = (): void => {
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active -= 1;
        next();
      });
    };
    signal.addEventListener(
      'abort',
      () => {
        const index = waiting.indexOf(start);
        if (index >= 0) waiting.splice(index, 1);
        resolve(null);
      },
      { once: true },
    );
    waiting.push(start);
    if (active < MAX_CONCURRENT) next();
  });
}
