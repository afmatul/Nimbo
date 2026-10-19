import { fetchObjectBytes, type ObjectBytes } from './object-bytes';
import { readStreamBytes } from './stream-bytes';
import { Reader } from './zip-core';

type ObjectSource = { readonly url: string; readonly signal: AbortSignal };
type RangeBytes = { readonly bytes: Uint8Array; readonly totalLength: ObjectBytes['totalLength'] };

const FAILURE_MESSAGE = 'No se pudo leer el paquete para la vista previa.';
const EMPTY = new Uint8Array(0);

/**
 * Fuente ZIP por rangos mediante la API pública `Reader` de zip.js (decisión D1, plan §2.4: sin su lector HTTP).
 * Toda la política HTTP vive en `fetchObjectBytes`; aquí solo se piden rangos y se conserva el total.
 */
export class ObjectRangeReader extends Reader<string> {
  readonly #source: ObjectSource;
  #signal: AbortSignal;
  #failed = false;

  constructor(source: ObjectSource) {
    // zip.js no necesita el valor: la URL firmada queda solo en el campo privado.
    super('');
    this.#source = source;
    this.#signal = source.signal;
  }

  /** Fallo de transporte ya saneado, sin depender de cómo zip.js envuelva el error. */
  get failed(): boolean {
    return this.#failed;
  }

  /** Las partes se leen secuencialmente; cancelar una no invalida el paquete ni su siguiente lectura. */
  async withSignal(signal: AbortSignal, read: () => Promise<void>): Promise<void> {
    this.#signal = signal;
    this.#failed = false;
    try {
      await read();
    } finally {
      this.#signal = this.#source.signal;
    }
  }

  override async init(): Promise<void> {
    const { totalLength } = await this.#read({ start: 0, end: 0 });
    if (totalLength === undefined) throw this.#failure();
    this.size = totalLength;
    await super.init?.();
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (![index, length].every((value) => Number.isSafeInteger(value) && value >= 0))
      throw this.#failure();
    if (length === 0 || index >= this.size) return EMPTY;
    const end = Math.min(index + length, this.size) - 1;
    const { bytes, totalLength } = await this.#read({ start: index, end });
    if (totalLength !== this.size) throw this.#failure();
    return bytes;
  }

  async #read(range: { readonly start: number; readonly end: number }): Promise<RangeBytes> {
    try {
      const result = await fetchObjectBytes({ ...this.#source, signal: this.#signal, range });
      return { bytes: await readStreamBytes(result.body), totalLength: result.totalLength };
    } catch {
      throw this.#failure();
    }
  }

  #failure(): Error {
    this.#failed = true;
    return new Error(FAILURE_MESSAGE);
  }
}
