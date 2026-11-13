import type { TransactionContext } from '../../../../shared';
import { createActor, Role } from '../../../../shared';
import type { IndexedFileRef } from '../../../storage';
import type { ExtractorRegistry } from '../../application/extractor-registry';

import { SqlIndexStatusReader } from './sql-index-status.reader';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const fileOf = (id: string, kind: IndexedFileRef['kind']): IndexedFileRef => ({
  id,
  kind,
  currentVersionId: `v-${id}`,
});

const setup = (rows: { versionId: string; state: string }[]) => {
  const query = jest.fn(() => Promise.resolve(rows));
  const context = { requireActorScope: () => ({ query }) } as unknown as TransactionContext;
  const extractors = { supports: (kind: string) => kind !== 'imagen' } as ExtractorRegistry;
  return { reader: new SqlIndexStatusReader(context, extractors), query };
};

describe('SqlIndexStatusReader (explorador, spec 019)', () => {
  it('traduce cada estado de `indexacion` y deja `pending` el indexable sin fila', async () => {
    const { reader } = setup([
      { versionId: 'v-a', state: 'pendiente' },
      { versionId: 'v-b', state: 'indexando' },
      { versionId: 'v-c', state: 'indexado' },
      { versionId: 'v-d', state: 'fallido' },
      { versionId: 'v-e', state: 'no_indexable' },
    ]);
    const files = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => fileOf(id, 'pdf'));

    const statuses = await reader.statusesOf(ANA, files);

    expect(Object.fromEntries(statuses)).toEqual({
      a: 'pending',
      b: 'processing',
      c: 'indexed',
      d: 'failed',
      e: 'unsupported',
      f: 'pending',
    });
  });

  it('un tipo sin extractor es `unsupported` y no se consulta', async () => {
    const { reader, query } = setup([]);

    const statuses = await reader.statusesOf(ANA, [fileOf('img', 'imagen')]);

    expect(statuses.get('img')).toBe('unsupported');
    expect(query).not.toHaveBeenCalled();
  });
});
