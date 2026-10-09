/** Catálogo de códigos de error de `audit` (plan 004 §4). Las clases de `api` los reutilizan (Art. VI). */
export const AUDIT_ERROR_CODES = {
  AUDIT_INVALID_QUERY: 'AUDIT_INVALID_QUERY',
} as const;
export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[keyof typeof AUDIT_ERROR_CODES];

/** Conjunto cerrado de `fields[].reason` de `AUDIT_INVALID_QUERY`. */
export const AUDIT_FIELD_ISSUE_REASONS = [
  'INVALID_DATE',
  'INVALID_RANGE',
  'INVALID_ORIGIN',
  'INVALID_CURSOR',
] as const;
export type AuditFieldIssueReason = (typeof AUDIT_FIELD_ISSUE_REASONS)[number];

/** Mensaje de cada `reason`: la API lo envía y `web` lo muestra junto al filtro (Art. VI.3). */
export const AUDIT_FIELD_MESSAGES: Readonly<Record<AuditFieldIssueReason, string>> = {
  INVALID_DATE: 'Esta fecha no es válida. Elige otra fecha y vuelve a intentarlo.',
  INVALID_RANGE:
    'La fecha «Hasta» debe ser posterior a «Desde». Corrige el rango y vuelve a intentarlo.',
  INVALID_ORIGIN:
    'Este origen no es válido. Elige «Todo», «Yo» o «Personal de Nimbo» y vuelve a intentarlo.',
  INVALID_CURSOR:
    'No pudimos leer esta página de la actividad. Actualiza la lista e inténtalo de nuevo.',
};
