import { toBatchResult } from './batch-result.response';

describe('toBatchResult', () => {
  it('aplana cada fallo con su tipo, id y código', () => {
    const file = { type: 'file', id: 'f-1' } as const;
    const folder = { type: 'folder', id: 'd-1' } as const;

    expect(
      toBatchResult({
        succeeded: [file],
        failed: [{ item: folder, code: 'STORAGE_NODE_NOT_FOUND' }],
      }),
    ).toEqual({
      succeeded: [file],
      failed: [{ type: 'folder', id: 'd-1', code: 'STORAGE_NODE_NOT_FOUND' }],
    });
  });
});
