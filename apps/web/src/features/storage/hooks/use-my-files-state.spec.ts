/**
 * @jest-environment jsdom
 */
import type {
  FileSummary,
  FolderContentsResponse,
  ExplorerNode,
  NodeSummary,
} from '@nimbo/contracts';
import { renderHook } from '@testing-library/react';

import { DEFAULT_NODE_ORDER, type NodeOrder } from '../node-order';

import type { FolderListing } from './use-folder-contents';
import type { FolderDisclosureState } from './use-folder-disclosure';
import { visibleOf } from './use-my-files-state';
import { useRefreshWhen } from './use-refresh-when';

const AT = '2026-09-30T10:00:00.000Z';
const BY_NAME: NodeOrder = { sort: 'name', dir: 'asc' };

function file(n: number, folderId: string | null = null): FileSummary {
  return {
    id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
    name: `archivo-${String(n)}.pdf`,
    sizeBytes: n * 1_000,
    kind: 'pdf',
    folderId,
    createdAt: AT,
    updatedAt: AT,
  };
}

function listingOf(order: NodeOrder, files: readonly FileSummary[]): FolderListing {
  const items: ExplorerNode[] = files.map((summary) => ({
    type: 'file',
    ...summary,
    shared: false,
    indexStatus: 'indexed',
  }));
  const contents: FolderContentsResponse = {
    folder: null,
    breadcrumbs: [],
    items,
    nextCursor: null,
    accessLevel: 'OWNER',
  };
  return { status: 'ready', contents, order };
}

const NOTHING_DISCLOSED: FolderDisclosureState = {
  listingOf: () => undefined,
  toggle: jest.fn(),
  retry: jest.fn(),
  refreshAll: jest.fn(),
};

function namesOf(order: NodeOrder, uploaded: readonly FileSummary[]): readonly string[] {
  const { nodes } = visibleOf({
    folderId: null,
    listing: listingOf(order, [file(1), file(3)]),
    disclosed: NOTHING_DISCLOSED,
    changes: { uploaded, organized: new Map(), trashedIds: new Set() },
    shownOrder: order,
  });
  return nodes.map((node) => node.name);
}

describe('visibleOf: lo subido en esta pestaña según el orden (CA-10, I-1)', () => {
  it('con el orden de 006 lo recién subido va arriba del grupo de archivos', () => {
    expect(namesOf(DEFAULT_NODE_ORDER, [file(2)])).toEqual([
      'archivo-2.pdf',
      'archivo-1.pdf',
      'archivo-3.pdf',
    ]);
  });

  it('con otro orden no se coloca a mano: la lista queda como la ordenó el servidor', () => {
    expect(namesOf(BY_NAME, [file(2)])).toEqual(['archivo-1.pdf', 'archivo-3.pdf']);
  });
});

describe('useRefreshWhen: relee el listado cuando cambia la señal (I-1)', () => {
  it('con otro orden relee cuando la señal cambia y no al montar', () => {
    const refresh = jest.fn();
    const { rerender } = renderHook(({ signal }) => useRefreshWhen(true, refresh, signal), {
      initialProps: { signal: 0 },
    });
    expect(refresh).not.toHaveBeenCalled();

    rerender({ signal: 1 });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('con el orden de 006 no relee: lo subido ya se muestra arriba', () => {
    const refresh = jest.fn();
    const { rerender } = renderHook(({ signal }) => useRefreshWhen(false, refresh, signal), {
      initialProps: { signal: 0 },
    });

    rerender({ signal: 1 });

    expect(refresh).not.toHaveBeenCalled();
  });

  it('una señal que no cambió no vuelve a leer', () => {
    const refresh = jest.fn();
    const { rerender } = renderHook(({ signal }) => useRefreshWhen(true, refresh, signal), {
      initialProps: { signal: 1 },
    });

    rerender({ signal: 1 });

    expect(refresh).not.toHaveBeenCalled();
  });
});
