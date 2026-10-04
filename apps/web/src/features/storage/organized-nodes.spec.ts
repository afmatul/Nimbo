import type { NodeSummary } from '@nimbo/contracts';

import { withArrivals, withOrganized } from './organized-nodes';

const AT = '2026-09-30T10:00:00.000Z';
const ALPHA = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const BETA = '2a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const folder = (id: string, name: string, parentId: string | null): NodeSummary => ({
  type: 'folder',
  id,
  name,
  parentId,
  createdAt: AT,
});
const file = (id: string, name: string, folderId: string | null): NodeSummary => ({
  type: 'file',
  id,
  name,
  sizeBytes: 10,
  kind: 'pdf',
  folderId,
  createdAt: AT,
});

describe('withOrganized (006 CA-4, CA-7)', () => {
  const listed = [
    folder(BETA, 'Beta', ALPHA),
    file('f-1', 'a.pdf', ALPHA),
    file('f-2', 'b.pdf', ALPHA),
  ];

  it('CA-4: lo renombrado se ve con el nombre nuevo en su lugar', () => {
    const organized = new Map([['f-1', file('f-1', 'nuevo.pdf', ALPHA)]]);

    expect(withOrganized(listed, organized, ALPHA).map((node) => node.name)).toEqual([
      'Beta',
      'nuevo.pdf',
      'b.pdf',
    ]);
  });

  it('CA-7: lo movido sale del origen', () => {
    const organized = new Map([
      [BETA, folder(BETA, 'Beta', null)],
      ['f-2', file('f-2', 'b.pdf', BETA)],
    ]);

    expect(withOrganized(listed, organized, ALPHA).map((node) => node.id)).toEqual(['f-1']);
  });
});

describe('withArrivals (006 CA-26)', () => {
  it('CA-26: suma lo que llegó a la carpeta desde otro nivel, sin repetir lo listado', () => {
    const listed = [folder(BETA, 'Beta', ALPHA), file('f-1', 'a.pdf', ALPHA)];
    const organized = new Map([
      ['f-1', file('f-1', 'a2.pdf', ALPHA)],
      ['f-9', file('f-9', 'llegó.pdf', ALPHA)],
      ['f-8', file('f-8', 'otra.pdf', BETA)],
    ]);

    expect(withArrivals(listed, organized, ALPHA).map((node) => node.id)).toEqual([
      BETA,
      'f-1',
      'f-9',
    ]);
  });
});
