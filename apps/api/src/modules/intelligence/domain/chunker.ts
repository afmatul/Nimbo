import type { Chunk } from './chunk';
import { NotIndexableError } from './errors';
import type { Segment } from './segment';

/** Largo al que se cierra un fragmento (plan 019 §2). */
export const CHUNK_TARGET_CHARS = 1000;
/** Largo que un fragmento nunca supera (plan 019 §2). */
export const CHUNK_MAX_CHARS = 1500;
/** Tope de fragmentos por versión (D-4): superarlo es `no_indexable/demasiado_grande` (CA-7). */
export const MAX_CHUNKS_PER_VERSION = 5000;

/** Un corte en un espacio no deja un trozo menor que esto; si no hay espacio, se corta por el objetivo. */
const MIN_WORD_CUT = CHUNK_TARGET_CHARS / 2;
const LAST_WHITESPACE = /\s(?=\S*$)/;
const JOINER = '\n';

type Piece = Omit<Chunk, 'order'>;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Posición del corte: el último espacio antes del objetivo o, sin espacios, el objetivo sin partir un par sustituto. */
function cutIndex(text: string): number {
  const space = text.slice(0, CHUNK_TARGET_CHARS + 1).search(LAST_WHITESPACE);
  if (space >= MIN_WORD_CUT) return space;
  return isHighSurrogate(text.charCodeAt(CHUNK_TARGET_CHARS - 1))
    ? CHUNK_TARGET_CHARS - 1
    : CHUNK_TARGET_CHARS;
}

/** Trozos completos de un texto largo y su resto, todos ≤ `CHUNK_MAX_CHARS`; un texto que ya cabe es solo resto. */
function splitLongText(text: string): { readonly whole: readonly string[]; readonly rest: string } {
  const whole: string[] = [];
  let rest = text;
  while (rest.length > CHUNK_MAX_CHARS) {
    const cut = cutIndex(rest);
    whole.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return { whole, rest };
}

/** Acumula fragmentos en orden; solo une un trozo con el anterior si es de la misma ubicación (RN-3). */
class ChunkList {
  private readonly chunks: Chunk[] = [];
  private current: Piece | undefined;

  /** Trozo que puede unirse con el anterior y con el siguiente. */
  offer(piece: Piece): void {
    if (this.current !== undefined && this.canJoin(this.current, piece)) {
      this.current = {
        text: `${this.current.text}${JOINER}${piece.text}`,
        location: this.current.location.mergeWith(piece.location),
      };
      return;
    }
    this.flush();
    this.current = piece;
  }

  /** Trozo de un segmento partido: es un fragmento completo por sí solo. */
  addWhole(piece: Piece): void {
    this.flush();
    this.push(piece);
  }

  finish(): readonly Chunk[] {
    this.flush();
    return Object.freeze([...this.chunks]);
  }

  private canJoin(current: Piece, next: Piece): boolean {
    return (
      current.location.groupKey() === next.location.groupKey() &&
      current.text.length < CHUNK_TARGET_CHARS &&
      current.text.length + JOINER.length + next.text.length <= CHUNK_MAX_CHARS
    );
  }

  private flush(): void {
    if (this.current !== undefined) this.push(this.current);
    this.current = undefined;
  }

  private push(piece: Piece): void {
    if (this.chunks.length === MAX_CHUNKS_PER_VERSION)
      throw new NotIndexableError('demasiado_grande');
    this.chunks.push(Object.freeze({ order: this.chunks.length, ...piece }));
  }
}

/**
 * Agrupa los segmentos de un extractor en fragmentos (diagrama M6, RN-3): une segmentos contiguos solo con igual
 * `groupKey()`, cierra al llegar a `CHUNK_TARGET_CHARS` sin pasar de `CHUNK_MAX_CHARS` y parte los largos sin cambiar
 * su ubicación. Ignora segmentos en blanco.
 */
export class Chunker {
  split(segments: readonly Segment[]): readonly Chunk[] {
    const list = new ChunkList();
    for (const { text, location } of segments) {
      const trimmed = text.trim();
      if (trimmed.length === 0) continue;
      const { whole, rest } = splitLongText(trimmed);
      for (const piece of whole) list.addWhole({ text: piece, location });
      list.offer({ text: rest, location });
    }
    return list.finish();
  }
}
