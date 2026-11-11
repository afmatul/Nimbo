export type SlideSummary = {
  readonly index: number;
  /** `hidden` se presenta como «Oculta»; sigue siendo una unidad navegable (CA-1). */
  readonly state: 'visible' | 'hidden';
};

export type PresentationPreview = {
  readonly kind: 'pptx';
  readonly slides: readonly SlideSummary[];
};

export type SlideBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'table'; readonly rows: readonly (readonly string[])[] };

export type SlideProjection = {
  readonly index: number;
  readonly blocks: readonly SlideBlock[];
};

export type SlideReading = {
  readonly current: () => boolean;
  readonly signal?: AbortSignal | undefined;
};

export type PptxPresentation = {
  readonly preview: PresentationPreview;
  readonly readSlide: (index: number, reading: SlideReading) => Promise<SlideProjection>;
};
