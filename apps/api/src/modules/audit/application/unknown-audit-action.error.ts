/**
 * Una acción fuera del catálogo cerrado (RN-3) llegó a `recordInTransaction`. Es un error de programación (como los de
 * `actor-scope.errors`), no un `DomainError`: el filtro lo responde como 500 genérico. El mensaje no repite la acción.
 */
export class UnknownAuditActionError extends Error {
  constructor() {
    super(
      'La acción de auditoría no está en el catálogo: agrégala a `AUDIT_CATALOG` antes de registrarla.',
    );
    this.name = 'UnknownAuditActionError';
  }
}
