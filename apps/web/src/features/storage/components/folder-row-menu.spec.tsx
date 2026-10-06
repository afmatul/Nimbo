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
  updatedAt: '2026-09-30T10:00:00.000Z',
};

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Mis archivos · Nimbo';
});

describe('FolderRowMenu (mockup acciones-carpeta)', () => {
  it('CA-4, CA-7, CA-11: «Acciones de {carpeta}» abre «Renombrar», «Mover a…» y «Mover a la papelera»', async () => {
    const onRename = jest.fn();
    const onMove = jest.fn();
    const onMoveToTrash = jest.fn();
    render(
      <main>
        <FolderRowMenu
          folder={FOLDER}
          onRename={onRename}
          onMove={onMove}
          onMoveToTrash={onMoveToTrash}
          pin={{ pinned: false, onToggle: jest.fn() }}
        />
      </main>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Prompts' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Renombrar',
      'Mover a…',
      'Fijar en la barra lateral',
      'Mover a la papelera',
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

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Prompts' }));
    const trash = screen.getByRole('menuitem', { name: 'Mover a la papelera' });
    expect(trash.className).not.toMatch(/destructive/);
    await userEvent.click(trash);
    expect(onMoveToTrash).toHaveBeenCalledTimes(1);
  });

  it('006 CA-27: fijar y quitar una carpeta de la barra lateral desde su menú', async () => {
    const onToggle = jest.fn();
    const { rerender } = render(
      <main>
        <FolderRowMenu
          folder={FOLDER}
          onRename={jest.fn()}
          onMove={jest.fn()}
          onMoveToTrash={jest.fn()}
          pin={{ pinned: false, onToggle }}
        />
      </main>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Prompts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Fijar en la barra lateral' }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <main>
        <FolderRowMenu
          folder={FOLDER}
          onRename={jest.fn()}
          onMove={jest.fn()}
          onMoveToTrash={jest.fn()}
          pin={{ pinned: true, onToggle }}
        />
      </main>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Prompts' }));

    expect(screen.getByRole('menuitem', { name: 'Quitar de la barra lateral' })).toBeTruthy();
  });
});
