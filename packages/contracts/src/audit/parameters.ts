/** Eventos por página de `GET /audit/my-events`: fijo, no hay `limit` (D-8, CA-9). */
export const AUDIT_PAGE_SIZE = 20;

/** Longitud máxima del motivo escrito de Soporte (`note`, D-6). */
export const AUDIT_NOTE_MAX_LENGTH = 500;

/** Origen de un evento: lo hizo el propio afectado («Yo») o el personal de Nimbo (D-8, CA-10). */
export const AUDIT_ORIGINS = ['self', 'staff'] as const;
export type AuditOrigin = (typeof AUDIT_ORIGINS)[number];

/**
 * Quién disparó la acción: el cliente (`manual`), un ciclo programado (`scheduled`: la purga de la papelera, CA-7, y la
 * renovación automática de la suscripción, 010) o alguien con el enlace público del propietario (`public_link`: la
 * descarga y el bloqueo, 013 CA-18, ADR-0039 regla 5).
 */
export const AUDIT_TRIGGERS = ['manual', 'scheduled', 'public_link'] as const;
export type AuditTrigger = (typeof AUDIT_TRIGGERS)[number];
