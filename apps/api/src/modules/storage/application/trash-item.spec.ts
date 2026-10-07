import { trashItemSchema } from '@nimbo/contracts';

import type { TrashEntry } from './ports/i-trash.repository.port';
import { toTrashItem } from './trash-item';

const DELETED_AT = new Date('2026-09-30T10:00:00.000Z');
const PURGE_AT = new Date('2026-10-30T10:00:00.000Z');

const entry = (overrides: Partial<TrashEntry>): TrashEntry => ({
  id: '33333333-3333-4333-8333-333333333333',
  type: 'file',
  name: 'acta.pdf',
  kind: 'pdf',
  sizeBytes: 2048n,
  originalFolder: null,
  deletedAt: DELETED_AT,
  purgeAt: PURGE_AT,
  ...overrides,
});

describe('toTrashItem', () => {
  it('CA-12: un archivo lleva su tipo, tamaño como número y fechas ISO, y cumple el contrato', () => {
    const item = toTrashItem(entry({}));

    expect(item).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      type: 'file',
      name: 'acta.pdf',
      kind: 'pdf',
      sizeBytes: 2048,
      originalFolder: null,
      deletedAt: DELETED_AT.toISOString(),
      purgeAt: PURGE_AT.toISOString(),
    });
    expect(trashItemSchema.parse(item)).toEqual(item);
  });

  it('CA-11: una carpeta no lleva `kind` y muestra su carpeta original', () => {
    const originalFolder = { id: '44444444-4444-4444-8444-444444444444', name: 'Clientes' };

    const item = toTrashItem(entry({ type: 'folder', name: 'Acme', kind: null, originalFolder }));

    expect(item).not.toHaveProperty('kind');
    expect(trashItemSchema.parse(item)).toMatchObject({ type: 'folder', originalFolder });
  });
});
