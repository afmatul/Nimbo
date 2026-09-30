/** Versión y fecha de vigencia de un documento legal (D-14). */
export interface LegalDocumentVersion {
  readonly version: string;
  /** Fecha ISO-8601 (`YYYY-MM-DD`). */
  readonly effectiveDate: string;
}

/**
 * Versiones vigentes de los Términos y la Política de privacidad: la misma fuente para la aceptación que guarda el
 * servidor (CA-1) y para lo que muestran las páginas (CA-23). Una versión nueva cambia este objeto.
 */
export const LEGAL_DOCUMENTS: {
  readonly terms: LegalDocumentVersion;
  readonly privacy: LegalDocumentVersion;
} = {
  terms: { version: '1.0', effectiveDate: '2026-09-30' },
  privacy: { version: '1.0', effectiveDate: '2026-09-30' },
};

/**
 * Correo de contacto de Nimbo (001 plan §6.13): única constante para las páginas legales, el mensaje de cuenta
 * suspendida (002 CA-4) y 003.
 */
export const SUPPORT_CONTACT_EMAIL = 'amatultab@gmail.com';
