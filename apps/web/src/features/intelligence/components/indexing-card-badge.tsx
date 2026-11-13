'use client';

import type { FileKind } from '@nimbo/contracts';
import * as React from 'react';

import { useNearViewport } from '../../../lib/use-near-viewport';
import { useIndexingStatus } from '../hooks/use-indexing-status';
import type { IndexingApi } from '../indexing-api';

import { IndexingPill } from './indexing-status-chip';

/** Tipos que `ExtractorRegistry` indexa (019); imágenes y «otros» nunca tienen estado, así que no se consulta. */
const INDEXED_KINDS: ReadonlySet<FileKind> = new Set(['docx', 'pdf', 'texto', 'xlsx', 'pptx']);

const NOOP = (): void => undefined;

/** Lee el estado (y lo mantiene al día por el canal en vivo) solo cuando el componente se monta. */
function IndexingBadgeReading({
  api,
  fileId,
}: {
  readonly api: IndexingApi;
  readonly fileId: string;
}): React.JSX.Element | null {
  const { status } = useIndexingStatus(api, fileId, NOOP);
  return <IndexingPill status={status} compact />;
}

/**
 * Insignia de indexación de la tarjeta de un archivo («Indexado», «Indexando…», «Sin indexar»), sin porcentaje: el
 * estado real no lo tiene. Pide el estado cuando la tarjeta está cerca de la pantalla; sin estado no muestra nada.
 */
export function IndexingCardBadge({
  api,
  file,
}: {
  readonly api: IndexingApi;
  readonly file: { readonly id: string; readonly kind: FileKind };
}): React.JSX.Element | null {
  const [anchor, setAnchor] = React.useState<HTMLSpanElement | null>(null);
  const near = useNearViewport(anchor);
  if (!INDEXED_KINDS.has(file.kind)) return null;
  return (
    <>
      <span ref={setAnchor} className="inline-block h-px w-px" aria-hidden="true" />
      {near ? <IndexingBadgeReading api={api} fileId={file.id} /> : null}
    </>
  );
}
