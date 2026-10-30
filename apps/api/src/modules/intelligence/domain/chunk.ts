import type { SourceLocation } from './source-location';

/**
 * Fragmento listo para vectorizar (diagrama M6): texto de una sola ubicación (RN-3) y su `order` dentro de la versión,
 * desde 0 (`fragmento.orden`). El archivo, la versión y el vector los agrega el pipeline.
 */
export interface Chunk {
  readonly order: number;
  readonly text: string;
  readonly location: SourceLocation;
}
