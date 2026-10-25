import type { RetrievedFragment } from './retrieved-fragment';

/**
 * Salida del filtro: la cita de un ordinal entregado (una vez, antes del texto que la menciona) o texto ya limpio.
 * El archivo, la versión y la ubicación de la cita salen del fragmento del servidor, nunca del modelo (D-5, RN-6).
 */
export type FilteredPiece =
  | { readonly type: 'citation'; readonly ordinal: number; readonly fragment: RetrievedFragment }
  | { readonly type: 'text'; readonly text: string };

const MARKER = /\[(\d+)\]/g;
/** Inicio de marca que aún puede completarse con el siguiente trozo: `[` seguido solo de cifras, al final. */
const OPEN_MARKER_TAIL = /\[(\d*)$/;

/**
 * Filtra las marcas `[n]` del flujo del modelo (plan 020 D-5). Conserva solo las de los fragmentos entregados
 * (`1..K`, sin ceros a la izquierda) y quita las demás; un `[n]` partido entre trozos se retiene hasta saber qué es.
 * Tiene estado: un filtro por respuesta; `push` por trozo y `finish` al cerrar el flujo.
 */
export class CitationMarkerFilter {
  private readonly cited = new Set<number>();
  private readonly maxDigits: number;
  private pending = '';

  constructor(private readonly fragments: readonly RetrievedFragment[]) {
    this.maxDigits = String(fragments.length).length;
  }

  push(chunk: string): FilteredPiece[] {
    const text = this.pending + chunk;
    const cut = this.heldFrom(text);
    this.pending = text.slice(cut);
    return this.filter(text.slice(0, cut));
  }

  /** Entrega lo retenido: al cerrar el flujo, un `[n` sin cerrar ya no es marca. */
  finish(): FilteredPiece[] {
    const rest = this.pending;
    this.pending = '';
    return rest.length === 0 ? [] : [{ type: 'text', text: rest }];
  }

  /** Posición desde la que se retiene el final de `text` porque aún puede ser una marca; si no, su largo. */
  private heldFrom(text: string): number {
    const tail = OPEN_MARKER_TAIL.exec(text);
    if (tail === null || (tail[1] ?? '').length > this.maxDigits) return text.length;
    return tail.index;
  }

  private filter(text: string): FilteredPiece[] {
    const citations: FilteredPiece[] = [];
    const clean = text.replace(MARKER, (marker, digits: string) => {
      const fragment = this.fragmentFor(digits);
      if (fragment === undefined) return '';
      const ordinal = Number(digits);
      if (!this.cited.has(ordinal)) citations.push({ type: 'citation', ordinal, fragment });
      this.cited.add(ordinal);
      return marker;
    });
    return clean.length === 0 ? citations : [...citations, { type: 'text', text: clean }];
  }

  /** Fragmento del ordinal escrito `digits`, si es uno entregado y canónico (`[01]` no es `[1]`). */
  private fragmentFor(digits: string): RetrievedFragment | undefined {
    const ordinal = Number(digits);
    if (String(ordinal) !== digits || ordinal < 1) return undefined;
    return this.fragments[ordinal - 1];
  }
}
