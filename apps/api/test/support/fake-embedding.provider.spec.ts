import { itBehavesAsEmbeddingProvider } from './embedding-provider.contract';
import { FakeEmbeddingProvider } from './fake-embedding.provider';

describe('FakeEmbeddingProvider', () => {
  itBehavesAsEmbeddingProvider(() => new FakeEmbeddingProvider());

  it('el mismo texto da el mismo vector y cuenta las llamadas', async () => {
    const provider = new FakeEmbeddingProvider();

    const [first] = await provider.embed(['hola']);
    const [second] = await provider.embed(['hola']);

    expect(first).toEqual(second);
    expect(provider.calls).toBe(2);
  });
});
