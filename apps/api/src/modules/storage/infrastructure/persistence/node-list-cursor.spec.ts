import { InvalidQueryError } from '../../domain/errors';
import { File } from '../../domain/file';
import { FileName } from '../../domain/file-name.vo';
import { Folder } from '../../domain/folder';
import { FolderName } from '../../domain/folder-name.vo';
import { FolderPath } from '../../domain/folder-path';
import { NodeOrder } from '../../domain/node-order';
import type { NodeGroup, NodeSort, SortDirection } from '../../domain/node-order';

import { decodeNodeListCursor, encodeNodeListCursor } from './node-list-cursor';

const OWNER_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const NODE_ID = '0b7d4c1e-5f6a-4b8c-9d0e-1f2a3b4c5d6e';
const CREATED_AT = new Date('2026-09-30T10:15:30.123Z');
const UPDATED_AT = new Date('2026-10-01T08:00:00.456Z');
const CREATED_DESC = NodeOrder.of();

const aFile = (): File =>
  File.rehydrate({
    id: NODE_ID,
    ownerId: OWNER_ID,
    folderId: null,
    name: FileName.of('Informe.pdf'),
    kind: 'pdf',
    sizeBytes: 9_007_199_254_740_993n,
    currentVersionId: OWNER_ID,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    trash: null,
  });

const aFolder = (): Folder =>
  Folder.rehydrate({
    id: NODE_ID,
    ownerId: OWNER_ID,
    parentId: null,
    name: FolderName.of('Ñandú'),
    path: FolderPath.of(`/${NODE_ID}/`),
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    trash: null,
  });

const encoded = (tuple: unknown): string =>
  Buffer.from(JSON.stringify(tuple)).toString('base64url');

const errorOf = (cursor: string, order: NodeOrder): unknown => {
  try {
    decodeNodeListCursor(cursor, order);
  } catch (error) {
    return error;
  }
  return undefined;
};

const expectInvalidCursor = (cursor: string, order: NodeOrder = CREATED_DESC): void => {
  const error = errorOf(cursor, order);

  expect(error).toBeInstanceOf(InvalidQueryError);
  expect((error as InvalidQueryError).fields).toEqual([
    expect.objectContaining({ field: 'cursor', reason: 'INVALID_CURSOR' }),
  ]);
};

describe('cursor del listado de una carpeta', () => {
  it.each<[NodeSort, SortDirection, NodeGroup, string]>([
    ['created', 'desc', 'file', CREATED_AT.toISOString()],
    ['created', 'asc', 'folder', CREATED_AT.toISOString()],
    ['updated', 'desc', 'file', UPDATED_AT.toISOString()],
    ['name', 'asc', 'folder', 'Ñandú'],
    ['name', 'desc', 'file', 'Informe.pdf'],
    ['size', 'desc', 'file', '9007199254740993'],
    ['size', 'desc', 'folder', 'Ñandú'],
  ])(
    'CA-9: el cursor de `%s %s` en un nodo `%s` es opaco y vuelve a la misma posición',
    (sort, dir, group, value) => {
      const order = NodeOrder.of(sort, dir);
      const node = group === 'file' ? aFile() : aFolder();

      const cursor = encodeNodeListCursor(order, node);

      expect(cursor).not.toContain(NODE_ID);
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeNodeListCursor(cursor, order)).toEqual({ group, value, id: NODE_ID });
    },
  );

  it.each<[string, NodeOrder]>([
    ['otro criterio', NodeOrder.of('name')],
    ['otra dirección', NodeOrder.of('created', 'asc')],
  ])('CA-11: un cursor emitido para %s es `INVALID_CURSOR`', (_, other) => {
    expectInvalidCursor(encodeNodeListCursor(CREATED_DESC, aFile()), other);
  });

  it('CA-11: un cursor de 006 (`[grupo, creado_en, id]`) es `INVALID_CURSOR`', () => {
    expectInvalidCursor(encoded(['file', CREATED_AT.toISOString(), NODE_ID]));
  });

  it.each<[string, unknown, NodeOrder]>([
    [
      'grupo desconocido',
      ['created', 'desc', 'usuario', CREATED_AT.toISOString(), NODE_ID],
      CREATED_DESC,
    ],
    ['fecha inválida', ['created', 'desc', 'file', 'ayer', NODE_ID], CREATED_DESC],
    ['fecha que no es ISO', ['created', 'desc', 'file', '2026-09-30', NODE_ID], CREATED_DESC],
    ['fecha numérica', ['created', 'desc', 'file', 1, NODE_ID], CREATED_DESC],
    ['tamaño que no es entero', ['size', 'asc', 'file', '12.5', NODE_ID], NodeOrder.of('size')],
    ['tamaño negativo', ['size', 'asc', 'file', '-1', NODE_ID], NodeOrder.of('size')],
    [
      'valor que no es texto en una carpeta',
      ['size', 'asc', 'folder', 12, NODE_ID],
      NodeOrder.of('size'),
    ],
    ['nombre vacío', ['name', 'asc', 'file', '', NODE_ID], NodeOrder.of('name')],
    [
      'id que no es UUID',
      ['created', 'desc', 'file', CREATED_AT.toISOString(), '1 OR 1=1'],
      CREATED_DESC,
    ],
  ])('CA-11: un cursor con %s es `INVALID_CURSOR`', (_, tuple, order) => {
    expectInvalidCursor(encoded(tuple), order);
  });

  it.each([
    ['texto que no es base64url', '¡no!'],
    ['JSON que no es la tupla', encoded({ a: 1 })],
  ])('CA-11: un cursor con %s es `INVALID_CURSOR`', (_, cursor) => {
    expectInvalidCursor(cursor);
  });
});
