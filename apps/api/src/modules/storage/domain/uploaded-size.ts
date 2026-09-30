import { expectedPartBytes } from './multipart-layout';
import type { PartLayout } from './multipart-layout';

/** Tamaño de una parte ya recibida (la aplicación la lee de `listParts`). */
export interface ReceivedPartSize {
  readonly partNumber: number;
  readonly sizeBytes: bigint;
}

/**
 * Veredicto sobre los bytes reales al completar (CA-5, CA-7, CA-10). `incomplete` deja la carga reanudable; el resto
 * de violaciones la rechazan por tamaño.
 */
export type SizeVerdict =
  | { readonly ok: true; readonly sizeBytes: bigint }
  | { readonly ok: false; readonly violation: 'empty' | 'mismatch' | 'incomplete' }
  | {
      readonly ok: false;
      readonly violation: 'too_large';
      readonly sizeBytes: bigint;
      readonly maxBytes: bigint;
    };

const MISMATCH: SizeVerdict = Object.freeze({ ok: false, violation: 'mismatch' });
const INCOMPLETE: SizeVerdict = Object.freeze({ ok: false, violation: 'incomplete' });
const EMPTY: SizeVerdict = Object.freeze({ ok: false, violation: 'empty' });

function tooLarge(sizeBytes: bigint, maxBytes: bigint): SizeVerdict {
  return { ok: false, violation: 'too_large', sizeBytes, maxBytes };
}

function fitsLayout(declaredBytes: bigint, layout: PartLayout, part: ReceivedPartSize): boolean {
  const inRange =
    Number.isInteger(part.partNumber) &&
    part.partNumber >= 1 &&
    part.partNumber <= layout.totalParts;
  return inRange && part.sizeBytes === expectedPartBytes(declaredBytes, layout, part.partNumber);
}

/**
 * Partes recibidas de una carga por partes (función pura). Orden: el máximo del plan sobre la suma real; después
 * cada parte debe existir en el reparto y medir lo que le toca (así la suma no puede pasar de lo declarado); por
 * último, si falta alguna, la carga está incompleta.
 */
export function assessParts(
  declaredBytes: bigint,
  layout: PartLayout,
  parts: readonly ReceivedPartSize[],
  maxBytes: bigint,
): SizeVerdict {
  const sizeBytes = parts.reduce((sum, part) => sum + part.sizeBytes, 0n);
  if (sizeBytes > maxBytes) return tooLarge(sizeBytes, maxBytes);
  if (!parts.every((part) => fitsLayout(declaredBytes, layout, part))) return MISMATCH;
  const received = new Set(parts.map((part) => part.partNumber));
  return received.size === layout.totalParts ? { ok: true, sizeBytes } : INCOMPLETE;
}

/** Objeto ya ensamblado (carga simple o multipart recuperado): vacío, luego máximo del plan, luego lo declarado. */
export function assessObjectSize(
  declaredBytes: bigint,
  sizeBytes: bigint,
  maxBytes: bigint,
): SizeVerdict {
  if (sizeBytes === 0n) return EMPTY;
  if (sizeBytes > maxBytes) return tooLarge(sizeBytes, maxBytes);
  return sizeBytes === declaredBytes ? { ok: true, sizeBytes } : MISMATCH;
}
