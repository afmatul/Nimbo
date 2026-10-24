/** Estados de indexación de un archivo (spec 019 §3), los del `CHECK` de `indexacion.estado`. */
export const INDEXING_STATES = [
  'pendiente',
  'indexando',
  'indexado',
  'no_indexable',
  'fallido',
] as const;
export type IndexingState = (typeof INDEXING_STATES)[number];

/**
 * Por qué un archivo quedó `no_indexable` (`sin_texto`, `formato_no_soportado`, `demasiado_grande`) o `fallido`
 * (`proveedor_no_disponible`, `lectura_fallida`, `error_interno`); los del `CHECK` de `indexacion.motivo`. La interfaz
 * arma el texto desde el código.
 */
export const INDEXING_REASONS = [
  'sin_texto',
  'formato_no_soportado',
  'demasiado_grande',
  'proveedor_no_disponible',
  'lectura_fallida',
  'error_interno',
] as const;
export type IndexingReason = (typeof INDEXING_REASONS)[number];
