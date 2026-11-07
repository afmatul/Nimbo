import { Inject, Injectable } from '@nestjs/common';
import type {
  NodeSummary,
  SearchHit,
  SearchQuery,
  SearchResponse,
  SearchType,
} from '@nimbo/contracts';

import { I_TRANSACTION_RUNNER } from '../../../../shared';
import type { Actor, ITransactionRunner } from '../../../../shared';
import { toNodeSummary } from '../../application/node-summary';
import { categoryOf } from '../../domain/file-category';
import { FILE_KINDS } from '../../domain/file-kind';
import type { FileKind } from '../../domain/file-kind';

import { I_NODE_SEARCH_REPOSITORY } from './ports/i-node-search.repository.port';
import type {
  INodeSearchRepository,
  NodeSearchCriteria,
  NodeSearchHit,
} from './ports/i-node-search.repository.port';

const WHITESPACE = /\s+/u;

/** Palabras del texto (RN-1): NFC, sin espacios de sobra ni repetidas. */
const termsOf = (text: string): readonly string[] => {
  const words = text.normalize('NFC').trim().split(WHITESPACE);
  return [...new Set(words)].filter((word) => word !== '');
};

/** Tipos de archivo de la categoría (RN-3), desde la única tabla tipo → categoría de 007. */
const kindsOf = (category: SearchType): readonly FileKind[] =>
  FILE_KINDS.filter((kind) => categoryOf(kind) === category);

const criteriaOf = (query: SearchQuery): NodeSearchCriteria => ({
  terms: termsOf(query.q),
  limit: query.limit,
  ...(query.type === undefined ? {} : { kinds: kindsOf(query.type) }),
  ...(query.from === undefined ? {} : { from: new Date(query.from) }),
  ...(query.to === undefined ? {} : { to: new Date(query.to) }),
  ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
});

/** El resumen sin la carpeta que contiene al nodo: el actor no la ve y su id delataría que existe (CA-13, PD-152). */
const withoutParent = (summary: NodeSummary): NodeSummary =>
  summary.type === 'folder' ? { ...summary, parentId: null } : { ...summary, folderId: null };

/**
 * `shared`: el nodo es de otra cuenta (012). Sin ubicación visible no lleva el id de su carpeta (CA-2, CA-13). Solo
 * los archivos dicen por qué aparecen (018b RN-3).
 */
const toSearchHit =
  (actor: Actor) =>
  ({ node, location, matchedBy }: NodeSearchHit): SearchHit => {
    const summary = toNodeSummary(node);
    const extras = {
      location: location === null ? null : { id: location.id, name: location.name },
      shared: node.ownerId !== actor.id,
    };
    const visible = location === null ? withoutParent(summary) : summary;
    return visible.type === 'folder'
      ? { ...visible, ...extras }
      : { ...visible, ...extras, matchedBy };
  };

/**
 * Búsqueda por nombre, tipo y fecha (spec 018, DF-15) entre los nodos vivos que el actor ve. Leer metadatos propios:
 * sin auditoría ni bitácora propia, y nunca registra el texto buscado (CA-15).
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_SEARCH_REPOSITORY) private readonly nodes: INodeSearchRepository,
  ) {}

  async search(actor: Actor, query: SearchQuery): Promise<SearchResponse> {
    const page = await this.transactions.withActor(actor, () =>
      this.nodes.search(actor, criteriaOf(query)),
    );
    return { items: page.hits.map(toSearchHit(actor)), nextCursor: page.nextCursor };
  }
}
