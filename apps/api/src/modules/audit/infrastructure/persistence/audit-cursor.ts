import { AUDIT_FIELD_MESSAGES } from '@nimbo/contracts';

import { InvalidAuditQueryError } from '../../domain/audit-query';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TUPLE_LENGTH = 2;

/** Posición del último evento de una página en `ocurrido_en DESC, id DESC` (plan 004 §3). */
export interface AuditPosition {
  readonly occurredAt: Date;
  readonly id: string;
}

const invalidCursor = (): InvalidAuditQueryError =>
  new InvalidAuditQueryError([
    { field: 'cursor', reason: 'INVALID_CURSOR', message: AUDIT_FIELD_MESSAGES.INVALID_CURSOR },
  ]);

/**
 * Cursor opaco: base64url de `[ISO, id]`. El instante viene de `IClock` con milisegundos, así que el ida y vuelta es
 * exacto (R-4).
 */
export const encodeAuditCursor = (position: AuditPosition): string =>
  Buffer.from(JSON.stringify([position.occurredAt.toISOString(), position.id])).toString(
    'base64url',
  );

/** Lanza `InvalidAuditQueryError` (`INVALID_CURSOR`) si el cursor no es uno emitido por `encodeAuditCursor`. */
export function decodeAuditCursor(cursor: string): AuditPosition {
  const [occurredAt, id] = parseTuple(cursor);
  if (!isIsoInstant(occurredAt) || !isUuid(id)) throw invalidCursor();
  return { occurredAt: new Date(occurredAt), id };
}

function parseTuple(cursor: string): readonly unknown[] {
  let tuple: unknown;
  try {
    tuple = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(tuple) || tuple.length !== TUPLE_LENGTH) throw invalidCursor();
  return tuple as unknown[];
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

/** Instante tal como lo emite `Date.toISOString` (no basta con que `Date` lo entienda). */
function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
