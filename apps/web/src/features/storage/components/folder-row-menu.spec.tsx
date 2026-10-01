/**
 * @jest-environment jsdom
 */
import type { FolderSummary } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FolderRowMenu } from './folder-row-menu';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const FOLDER: FolderSummary = {
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Prompts',
  parentId: null,
  createdAt: '2026-09-30T10:00:00.000Z',
};

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Mis archivos · Nimbo';
});

describe('FolderRowMenu (mockup acciones-carpeta)', () => {
  it('CA-4, CA-7: «Acciones de {carpeta}» abre «Renombrar» y «Mover a…»', async () => {
    const onRename = jest.fn();
    const onMove = jest.fn();
    render(
      <main>
        <FolderRowMenu folder={FOLDER} onRename={onRename} onMove={onMove} />
      </main>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Prompts' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Renombrar',
      'Mover a…',
    ]);
    const { violations } = await axe(document.body);
    expect(violations.filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))).toEqual(
      [],
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    expect(onRename).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Prompts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mover a…' }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });
});
