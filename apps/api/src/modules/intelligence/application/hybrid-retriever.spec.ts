import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AgentQuestion } from '../domain/agent-question';
import type { AgentScope } from '../domain/agent-scope';
import { AgentUnavailableError, EmbeddingUnavailableError } from '../domain/errors';
import { PdfLocation } from '../domain/pdf-location';

import { CANDIDATES_PER_SEARCH, HybridRetriever, MIN_SIMILARITY, TOP_K } from './hybrid-retriever';
import type {
  IChunkSearch,
  KeywordQuery,
  ScoredChunk,
  SearchedChunk,
  VectorQuery,
} from './ports/i-chunk-search.port';
import type {
  Embedding,
  EmbeddingTask,
  IEmbeddingProvider,
} from './ports/i-embedding-provider.port';

const QUESTION_VECTOR: Embedding = [1, 0, 0];
const FOLDER_SCOPE: AgentScope = { type: 'folder', id: 'carpeta-1' };
const ANA: Actor = createActor('ana', Role.CLIENT);
const PDF_PAGE = { tipo: 'pdf', pagina: 2, confianza: 1 } as const;

const stored = (id: string, location: SearchedChunk['location'] = PDF_PAGE): SearchedChunk => ({
  id,
  fileId: `archivo-${id}`,
  versionId: `version-${id}`,
  fileName: `informe-${id}.pdf`,
  order: 0,
  text: `texto ${id}`,
  location,
});

const scored = (id: string, similarity: number): ScoredChunk => ({ ...stored(id), similarity });

/** `IChunkSearch` que devuelve listas fijas y anota lo que le piden y si había transacción abierta. */
class FakeChunkSearch implements IChunkSearch {
  keyword: readonly SearchedChunk[] = [];
  vector: readonly ScoredChunk[] = [];
  readonly keywordQueries: KeywordQuery[] = [];
  readonly vectorQueries: VectorQuery[] = [];

  constructor(private readonly journal: Journal) {}

  keywordSearch(_actor: Actor, query: KeywordQuery): Promise<readonly SearchedChunk[]> {
    this.journal.add('search:keyword');
    this.keywordQueries.push(query);
    return Promise.resolve(this.keyword);
  }

  vectorSearch(_actor: Actor, query: VectorQuery): Promise<readonly ScoredChunk[]> {
    this.journal.add('search:vector');
    this.vectorQueries.push(query);
    return Promise.resolve(this.vector);
  }

  hasIndexed(): Promise<boolean> {
    return Promise.reject(new Error('el recuperador no consulta `hasIndexed`'));
  }

  scopeExists(): Promise<boolean> {
    return Promise.reject(new Error('el recuperador no consulta `scopeExists`'));
  }
}

/** Embeddings que anotan la tarea y la apertura de la llamada (debe ir fuera de la transacción). */
class RecordingEmbeddings implements IEmbeddingProvider {
  readonly tasks: (EmbeddingTask | undefined)[] = [];
  failure: Error | undefined;

  constructor(private readonly journal: Journal) {}

  embed(texts: readonly string[], task?: EmbeddingTask): Promise<readonly Embedding[]> {
    this.journal.add('embed');
    this.tasks.push(task);
    if (this.failure !== undefined) return Promise.reject(this.failure);
    return Promise.resolve(texts.map(() => QUESTION_VECTOR));
  }
}

describe('HybridRetriever (plan 020 D-2)', () => {
  const question = AgentQuestion.parse('¿Cuánto crecieron las ventas?', 1000);
  let journal: Journal;
  let search: FakeChunkSearch;
  let embeddings: RecordingEmbeddings;
  let transactions: FakeTransactionRunner;
  let retriever: HybridRetriever;

  const retrieve = (scope: AgentScope = FOLDER_SCOPE) =>
    retriever.retrieve(ANA, { question, scope });

  beforeEach(() => {
    journal = new Journal();
    search = new FakeChunkSearch(journal);
    embeddings = new RecordingEmbeddings(journal);
    transactions = new FakeTransactionRunner(journal);
    retriever = new HybridRetriever(embeddings, search, transactions);
  });

  it('CA-17: vectoriza la pregunta como `query` fuera de la transacción y busca como el actor en su ámbito', async () => {
    await retrieve();

    expect(embeddings.tasks).toEqual(['query']);
    expect(journal.entries).toEqual([
      'embed',
      'tx:begin',
      'search:keyword',
      'search:vector',
      'tx:end',
    ]);
    expect(transactions.actors).toEqual([ANA.id]);
    expect(search.keywordQueries).toEqual([
      { text: question.text, scope: FOLDER_SCOPE, limit: CANDIDATES_PER_SEARCH },
    ]);
    expect(search.vectorQueries).toEqual([
      { vector: QUESTION_VECTOR, scope: FOLDER_SCOPE, limit: CANDIDATES_PER_SEARCH },
    ]);
  });

  it('CA-3: sin fragmentos accesibles no devuelve nada', async () => {
    await expect(retrieve()).resolves.toEqual({ fragments: [], discarded: 0 });
  });

  it('CA-3: descarta los vectoriales por debajo de `MIN_SIMILARITY` (umbral provisional hasta T-09)', async () => {
    search.vector = [scored('cerca', MIN_SIMILARITY), scored('lejos', MIN_SIMILARITY - 0.01)];

    const { fragments } = await retrieve();

    expect(fragments.map(({ id }) => id)).toEqual(['cerca']);
  });

  it('CA-1: fusiona ambas búsquedas por RRF y corta en `TOP_K`', async () => {
    const ids = Array.from({ length: TOP_K + 3 }, (_value, index) => `f${String(index)}`);
    search.keyword = ids.map((id) => stored(id)).reverse();
    search.vector = [scored(ids[0] ?? '', 1)];

    const { fragments } = await retrieve();

    expect(fragments).toHaveLength(TOP_K);
    expect(fragments[0]?.id).toBe(ids[0]);
  });

  it('RN-6, S-1: rehidrata la procedencia y entrega archivo, versión, nombre y texto del servidor', async () => {
    search.keyword = [stored('a')];

    const { fragments } = await retrieve();

    expect(fragments).toEqual([
      {
        id: 'a',
        fileId: 'archivo-a',
        versionId: 'version-a',
        fileName: 'informe-a.pdf',
        text: 'texto a',
        location: PdfLocation.page(2),
      },
    ]);
  });

  it('D-5: un fragmento con procedencia inválida no se recupera y se cuenta una sola vez', async () => {
    const broken = { tipo: 'pdf', confianza: 1 };
    search.keyword = [stored('roto', broken), stored('bueno')];
    search.vector = [{ ...stored('roto', broken), similarity: 1 }];

    await expect(retrieve()).resolves.toMatchObject({
      fragments: [{ id: 'bueno' }],
      discarded: 1,
    });
  });

  it('CA-15: si el proveedor de embeddings no responde, el agente no está disponible y no se busca', async () => {
    embeddings.failure = new EmbeddingUnavailableError();

    await expect(retrieve()).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(journal.entries).toEqual(['embed']);
  });

  it('CA-15: cualquier otro error del proveedor se propaga sin disfrazarlo', async () => {
    embeddings.failure = new TypeError('fallo de programación');

    await expect(retrieve()).rejects.toBeInstanceOf(TypeError);
  });
});
