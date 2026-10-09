import { DomainError } from '../../../shared/domain/errors';
import type { FieldIssue } from '../../../shared/domain/errors';

/** La consulta inválida es `400`, como en `storage` (plan 004 §4), no el `422` de `shared`. */
const BAD_REQUEST = 400;

/** Coincide con `AUDIT_FIELD_MESSAGES.INVALID_RANGE` de `contracts/audit` (ADR-0008); la prueba lo comprueba. */
const INVALID_RANGE_MESSAGE =
  'La fecha «Hasta» debe ser posterior a «Desde». Corrige el rango y vuelve a intentarlo.';

/** La consulta de la actividad no es válida (fechas, origen o cursor). HTTP 400 con `fields`. */
export class InvalidAuditQueryError extends DomainError {
  readonly code = 'AUDIT_INVALID_QUERY';
  readonly status = BAD_REQUEST;

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los filtros de tu actividad y vuelve a intentarlo.', fields);
  }
}

/** «Yo» o «Personal de Nimbo». Coincide con `AUDIT_ORIGINS` de `contracts/audit` sin importarlo (ADR-0008). */
export type AuditOrigin = 'self' | 'staff';

/** Filtros de la actividad propia (D-8): `from` inclusivo, `to` exclusivo, origen y cursor opaco; todos opcionales. */
export interface AuditQuery {
  readonly from?: Date;
  readonly to?: Date;
  readonly origin?: AuditOrigin;
  readonly cursor?: string;
}

/** Valida que `from < to` cuando vienen los dos (CA-10); lanza `InvalidAuditQueryError` (`to/INVALID_RANGE`). */
export function createAuditQuery(input: AuditQuery): AuditQuery {
  const { from, to } = input;
  if (from !== undefined && to !== undefined && from.getTime() >= to.getTime()) {
    throw new InvalidAuditQueryError([
      { field: 'to', reason: 'INVALID_RANGE', message: INVALID_RANGE_MESSAGE },
    ]);
  }
  return Object.freeze({ ...input });
}
