import { InvalidQueryError } from '../../domain/errors';

import { decodeNodeListCursor, encodeNodeListCursor } from './node-list-cursor';
import type { NodeListPosition } from './node-list-cursor';

const POSITION: NodeListPosition = {
  type: 'folder',
  createdAt: new Date('2026-09-30T10:15:30.123Z'),
  id: '0b7d4c1e-5f6a-4b8c-9d0e-1f2a3b4c5d6e',
};

const encoded = (tuple: unknown): string =>
  Buffer.from(JSON.stringify(tuple)).toString('base64url');

const invalidCursorOf = (cursor: string): unknown => {
  try {
    decodeNodeListCursor(cursor);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('cursor del listado de una carpeta', () => {
  it.each(['folder', 'file'] as const)(
    'CA-5: el cursor es opaco y vuelve a la misma posición (`%s`, `creado_en`, `id`)',
    (type) => {
      const position = { ...POSITION, type };

      const cursor = encodeNodeListCursor(position);

      expect(cursor).not.toContain(POSITION.id);
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeNodeListCursor(cursor)).toEqual(position);
    },
  );

  it.each([
    ['texto que no es base64url', '¡no!'],
    ['JSON que no es la tupla', encoded({ a: 1 })],
    ['tipo desconocido', encoded(['usuario', POSITION.createdAt.toISOString(), POSITION.id])],
    ['fecha inválida', encoded(['file', 'ayer', POSITION.id])],
    ['id que no es UUID', encoded(['file', POSITION.createdAt.toISOString(), '1 OR 1=1'])],
  ])('CA-5: un cursor con %s es `STORAGE_INVALID_QUERY` con `INVALID_CURSOR`', (_, cursor) => {
    const error = invalidCursorOf(cursor);

    expect(error).toBeInstanceOf(InvalidQueryError);
    expect((error as InvalidQueryError).fields).toEqual([
      expect.objectContaining({ field: 'cursor', reason: 'INVALID_CURSOR' }),
    ]);
  });
});
