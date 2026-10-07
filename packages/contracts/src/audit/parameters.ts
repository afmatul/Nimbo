/** Eventos por página de `GET /audit/my-events`: fijo, no hay `limit` (D-8, CA-9). */
export const AUDIT_PAGE_SIZE = 20;

/** Longitud máxima del motivo escrito de Soporte (`note`, D-6). */
export const AUDIT_NOTE_MAX_LENGTH = 500;

/** Origen de un evento: lo hizo el propio afectado («Yo») o el personal de Nimbo (D-8, CA-10). */
export const AUDIT_ORIGINS = ['self', 'staff'] as const;
export type AuditOrigin = (typeof AUDIT_ORIGINS)[number];

/** Quién disparó una purga: el cliente al vaciar o eliminar (`manual`) o el ciclo programado de la papelera (`scheduled`). */
export const AUDIT_TRIGGERS = ['manual', 'scheduled'] as const;
export type AuditTrigger = (typeof AUDIT_TRIGGERS)[number];
