import { BATCH_MAX_ITEMS, batchItemsSchema, batchResultSchema } from './batch';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const item = { type: 'file', id: ID };

describe('operaciones por lote', () => {
  it('acepta de 1 a 100 elementos de tipo archivo o carpeta con id UUID', () => {
    expect(BATCH_MAX_ITEMS).toBe(100);
    expect(batchItemsSchema.safeParse([item, { type: 'folder', id: ID }]).success).toBe(true);
    expect(batchItemsSchema.safeParse([]).success).toBe(false);
    expect(batchItemsSchema.safeParse(Array(BATCH_MAX_ITEMS + 1).fill(item)).success).toBe(false);
    expect(batchItemsSchema.safeParse([{ type: 'link', id: ID }]).success).toBe(false);
    expect(batchItemsSchema.safeParse([{ type: 'file', id: 'x' }]).success).toBe(false);
  });

  it('el resultado separa los elementos que salieron bien de los que fallaron, con su código', () => {
    const result = { succeeded: [item], failed: [{ ...item, code: 'STORAGE_NODE_NOT_FOUND' }] };

    expect(batchResultSchema.parse(result)).toEqual(result);
    expect(batchResultSchema.safeParse({ succeeded: [], failed: [item] }).success).toBe(false);
  });
});
