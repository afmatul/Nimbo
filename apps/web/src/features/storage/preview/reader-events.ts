/** Eventos internos para progreso y destrucción explícita antes de una nueva emisión. */
export type ReaderEvents = {
  readonly onReady?: () => void;
  readonly registerCleanup?: (dispose: () => Promise<void>) => () => void;
};
