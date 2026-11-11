import type { PreviewFailure } from './preview-failure';

/** Eventos internos para progreso y destrucción explícita antes de una nueva emisión. */
export type ReaderEvents = {
  readonly onReady?: () => void;
  readonly registerCleanup?: (dispose: () => Promise<void>) => () => void;
};

/** Contrato común de todo lector: qué leer, cómo avisar el fallo y los eventos del shell (Art. VI, una sola definición). */
export type ReaderProps = ReaderEvents & {
  readonly url: string;
  readonly onFailure: (failure: PreviewFailure) => void;
};
