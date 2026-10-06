import * as contracts from '../index';

import {
  QUICK_ACCESS_NODE_PATHS,
  quickAccessItemSchema,
  quickAccessLimitMessage,
  quickAccessListSchema,
  quickAccessNodePathSchema,
} from './quick-access-schemas';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

const folderItem = { type: 'folder', id: ID, name: 'Proyectos' };
const fileItem = { type: 'file', id: ID, name: 'informe.docx', kind: 'docx' };

describe('quickAccessItemSchema (plan 006 §9.2)', () => {
  it('CA-27: una carpeta lleva tipo, id y nombre, sin `kind`', () => {
    expect(quickAccessItemSchema.parse(folderItem)).toEqual(folderItem);
  });

  it('CA-27: un archivo lleva su `kind` para el ícono', () => {
    expect(quickAccessItemSchema.parse(fileItem)).toEqual(fileItem);
  });

  it.each([
    [
      'la fecha de fijado (el orden lo da el servidor)',
      { ...folderItem, pinnedAt: '2026-10-03T10:00:00.000Z' },
    ],
    ['un id que no es UUID', { ...folderItem, id: 'abc' }],
    ['un tipo desconocido', { ...folderItem, type: 'link' }],
    ['un nombre vacío', { ...folderItem, name: '' }],
  ])('CA-27: no admite %s', (_case, item) => {
    expect(quickAccessItemSchema.safeParse(item).success).toBe(false);
  });
});

describe('quickAccessListSchema (plan 006 §9.2)', () => {
  it('CA-27: `GET /quick-access` da fijados, recientes y si hay más recientes', () => {
    const list = { pinned: [folderItem], recent: [fileItem], hasMoreRecent: true };

    expect(quickAccessListSchema.parse(list)).toEqual(list);
  });

  it('CA-27: sin nada fijado ni abierto, las dos listas van vacías', () => {
    const empty = { pinned: [], recent: [], hasMoreRecent: false };

    expect(quickAccessListSchema.parse(empty)).toEqual(empty);
  });

  it('CA-27: `hasMoreRecent` es obligatorio', () => {
    expect(quickAccessListSchema.safeParse({ pinned: [], recent: [] }).success).toBe(false);
  });
});

describe('segmento `:nodeType` de las rutas de accesos rápidos', () => {
  it('CA-27: solo admite `files` y `folders`, como `/trash/{files|folders}`', () => {
    expect(QUICK_ACCESS_NODE_PATHS).toEqual(['files', 'folders']);
    expect(quickAccessNodePathSchema.safeParse('folders').success).toBe(true);
    expect(quickAccessNodePathSchema.safeParse('file').success).toBe(false);
  });
});

describe('quickAccessLimitMessage', () => {
  it('CA-28: nombra el tope configurado y dice qué hacer', () => {
    expect(quickAccessLimitMessage(5)).toBe('Ya fijaste 5 elementos. Quita uno para fijar otro.');
    expect(quickAccessLimitMessage(8)).toBe('Ya fijaste 8 elementos. Quita uno para fijar otro.');
  });
});

describe('exportaciones', () => {
  it('CA-27: la raíz del paquete exporta los esquemas de accesos rápidos', () => {
    expect(contracts.quickAccessListSchema).toBe(quickAccessListSchema);
    expect(contracts.STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT).toBe(
      'STORAGE_QUICK_ACCESS_LIMIT',
    );
  });
});
