const [BYTE_UNIT, ...LARGER_UNITS] = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const BASE = 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Tamaño legible en unidades decimales y coma española: `1500` → «1,5 KB». Compartido por API y web. */
export function formatBytes(bytes: number): string {
  let unit: string = BYTE_UNIT;
  let value = bytes;
  for (const larger of LARGER_UNITS) {
    if (round1(value) < BASE) break;
    value /= BASE;
    unit = larger;
  }
  const rounded = round1(value);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text} ${unit}`;
}
