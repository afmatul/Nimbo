import { AUDIT_FIELD_MESSAGES } from '@nimbo/contracts';

import { createAuditQuery, InvalidAuditQueryError } from './audit-query';

const EARLIER = new Date('2026-10-01T00:00:00.000Z');
const LATER = new Date('2026-10-05T00:00:00.000Z');

const errorOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('AuditQuery', () => {
  it('CA-9, CA-10: sin filtros es válida (todo el historial)', () => {
    expect(createAuditQuery({})).toEqual({});
  });

  it('CA-10: conserva rango, origen y cursor, y es inmutable', () => {
    const query = createAuditQuery({ from: EARLIER, to: LATER, origin: 'staff', cursor: 'abc' });

    expect(query).toEqual({ from: EARLIER, to: LATER, origin: 'staff', cursor: 'abc' });
    expect(Object.isFrozen(query)).toBe(true);
  });

  it.each([
    ['`to` anterior a `from`', LATER, EARLIER],
    ['`to` igual a `from`', EARLIER, EARLIER],
  ])('CA-10: %s es `AUDIT_INVALID_QUERY` con `to/INVALID_RANGE`', (_, from, to) => {
    const error = errorOf(() => createAuditQuery({ from, to }));

    expect(error).toBeInstanceOf(InvalidAuditQueryError);
    expect(error).toMatchObject({ code: 'AUDIT_INVALID_QUERY', status: 400 });
    expect((error as InvalidAuditQueryError).fields).toEqual([
      { field: 'to', reason: 'INVALID_RANGE', message: AUDIT_FIELD_MESSAGES.INVALID_RANGE },
    ]);
  });

  it('CA-10: un solo extremo del rango es válido', () => {
    expect(createAuditQuery({ from: LATER }).from).toEqual(LATER);
    expect(createAuditQuery({ to: EARLIER }).to).toEqual(EARLIER);
  });
});
