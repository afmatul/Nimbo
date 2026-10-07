import { InvalidAuditQueryError } from '../../domain/audit-query';

import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor';
import type { AuditPosition } from './audit-cursor';

const POSITION: AuditPosition = {
  occurredAt: new Date('2026-10-05T10:15:30.123Z'),
  id: '0b7d4c1e-5f6a-4b8c-9d0e-1f2a3b4c5d6e',
};

const encoded = (tuple: unknown): string =>
  Buffer.from(JSON.stringify(tuple)).toString('base64url');

const errorOf = (cursor: string): unknown => {
  try {
    decodeAuditCursor(cursor);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('cursor de la auditoría', () => {
  it('CA-9: es opaco y vuelve exacto a la misma posición (`ocurrido_en` con ms, `id`)', () => {
    const cursor = encodeAuditCursor(POSITION);

    expect(cursor).not.toContain(POSITION.id);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAuditCursor(cursor)).toEqual(POSITION);
  });

  it.each([
    ['texto que no es base64url', '¡no!'],
    ['JSON que no es la tupla', encoded({ a: 1 })],
    ['tupla de otro largo', encoded([POSITION.occurredAt.toISOString()])],
    ['fecha inválida', encoded(['ayer', POSITION.id])],
    ['fecha no canónica', encoded(['2026-10-05', POSITION.id])],
    ['id que no es UUID', encoded([POSITION.occurredAt.toISOString(), '1 OR 1=1'])],
  ])('CA-9: un cursor con %s es `AUDIT_INVALID_QUERY` con `INVALID_CURSOR`', (_, cursor) => {
    const error = errorOf(cursor);

    expect(error).toBeInstanceOf(InvalidAuditQueryError);
    expect((error as InvalidAuditQueryError).fields).toEqual([
      expect.objectContaining({ field: 'cursor', reason: 'INVALID_CURSOR' }),
    ]);
  });
});
