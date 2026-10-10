/** Configuración técnica de previsualización tomada del entorno validado (017 §5). */
export interface PreviewConfig {
  /** URLs de preview por actor en una ventana de 60 s. */
  readonly previewUrlPerMinute: number;
}

export const PREVIEW_CONFIG: unique symbol = Symbol('PreviewConfig');
