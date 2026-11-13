/**
 * @jest-environment jsdom
 */
import type { ReceivedShare } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReceivedShareMenu } from './received-share-menu';

const share = (patch: Partial<ReceivedShare>): ReceivedShare => ({
  shareId: 's1',
  nodeId: 'n1',
  nodeType: 'file',
  name: 'Informe.docx',
  level: 'EDITOR',
  owner: { displayName: 'Ana Demo' },
  createdAt: '2026-11-01T10:00:00.000Z',
  ...patch,
});

async function openMenu(value: ReceivedShare): Promise<void> {
  render(<ReceivedShareMenu share={value} onDownload={jest.fn()} onLeave={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /Acciones de/ }));
}

describe('ReceivedShareMenu · Editar', () => {
  it('ofrece «Editar» en un .docx compartido como Editor', async () => {
    await openMenu(share({}));
    expect(screen.getByRole('menuitem', { name: 'Editar' }).getAttribute('href')).toContain('n1');
  });

  it.each([
    ['Lector', share({ level: 'VIEWER' })],
    ['otro formato', share({ name: 'Notas.txt' })],
    ['carpeta', share({ nodeType: 'folder', name: 'Docs.docx' })],
  ])('no ofrece «Editar» para %s', async (_caso, value) => {
    await openMenu(value);
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).toBeNull();
  });
});
