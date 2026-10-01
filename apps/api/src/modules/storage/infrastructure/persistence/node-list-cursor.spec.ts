import { InvalidQueryError } from '../../domain/errors';

import { decodeFileListCursor, encodeFileListCursor } from './file-list-cursor';

const POSITION = {
  createdAt: new Date('2026-09-30T10:15:30.123Z'),
  id: '0b7d4c1e-5f6a-4b8c-9d0e-1f2a3b4c5d6e',
};

const invalidCursorOf = (cursor: string): unknown => {
  try {
    decodeFileListCursor(cursor);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('cursor del listado de archivos', () => {
  it('CA-1: el cursor es opaco y vuelve a la misma posición (`creado_en`, `id`)', () => {
    const cursor = encodeFileListCursor(POSITION);

    expect(cursor).not.toContain(POSITION.id);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFileListCursor(cursor)).toEqual(POSITION);
  });

  it.each([
    ['texto que no es base64url', '¡no!'],
    ['JSON que no es la tupla', Buffer.from('{"a":1}').toString('base64url')],
    ['fecha inválida', Buffer.from(JSON.stringify(['ayer', POSITION.id])).toString('base64url')],
    [
      'id que no es UUID',
      Buffer.from(JSON.stringify([POSITION.createdAt.toISOString(), '1 OR 1=1'])).toString(
        'base64url',
      ),
    ],
  ])('CA-7: un cursor con %s es `STORAGE_INVALID_QUERY` con `INVALID_CURSOR`', (_, cursor) => {
    const error = invalidCursorOf(cursor);

    expect(error).toBeInstanceOf(InvalidQueryError);
    expect((error as InvalidQueryError).fields).toEqual([
      expect.objectContaining({ field: 'cursor', reason: 'INVALID_CURSOR' }),
    ]);
  });
});
