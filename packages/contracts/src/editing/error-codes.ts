/** Códigos de error de `editing` (plan 016 §4). Las clases de `api` los reutilizan (Art. VI). */
export const EDITING_ERROR_CODES = {
  EDITING_UNSUPPORTED_FORMAT: 'EDITING_UNSUPPORTED_FORMAT',
  EDITING_UNAVAILABLE: 'EDITING_UNAVAILABLE',
  EDITING_SAVE_IN_PROGRESS: 'EDITING_SAVE_IN_PROGRESS',
} as const;
export type EditingErrorCode = (typeof EDITING_ERROR_CODES)[keyof typeof EDITING_ERROR_CODES];

/**
 * Por qué un documento se abre en solo lectura (CA-3, CA-5, CA-7, CA-21, CA-22). No son errores: la apertura responde
 * `200` con `mode: 'view'` y el motivo; la interfaz arma el texto desde el código.
 */
export const READ_ONLY_REASONS = [
  'EDITING_VIEW_ONLY',
  'EDITING_PLAN_READ_ONLY',
  'EDITING_OWNER_PLAN_READ_ONLY',
  'EDITING_LIMIT_REACHED',
  'EDITING_FILE_TOO_LARGE',
] as const;
export type ReadOnlyReason = (typeof READ_ONLY_REASONS)[number];
