/**
 * @jest-environment jsdom
 */
import { SHARING_ERROR_CODES } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { SpaceProvider } from '../../storage/components/space-provider';
import { StorageRequestError } from '../../storage/storage-request-error';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import { useAccessList } from '../hooks/use-access-list';
import type { SharingApi } from '../sharing-api';
import {
  directEntry,
  fakeSharingApi,
  INHERITED_ENTRY,
  NODE_ID,
  OTHER_SHARE_ID,
  SHARE_ID,
} from '../test-sharing';

import { AccessList } from './access-list';

const NODE = { nodeType: 'file', nodeId: NODE_ID } as const;
const NODE_NAME = 'Propuesta comercial v3.pdf';

function Harness({ api }: { readonly api: SharingApi }): React.JSX.Element {
  const access = useAccessList(api, NODE);
  return <AccessList access={access} nodeName={NODE_NAME} />;
}

function renderList(api: SharingApi, readOnly = false): void {
  const summary = { ...spaceSummaryWith(3 * GB), readOnly };
  render(
    <SpaceProvider api={{ spaceSummary: () => Promise.resolve(summary) }} uploadedCount={0}>
      <Harness api={api} />
    </SpaceProvider>,
  );
}

const listOf = (...entries: unknown[]) =>
  Promise.resolve({ entries }) as ReturnType<SharingApi['listAccess']>;

function personRow(name: string): HTMLElement {
  const row = screen
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null);
  if (!row) throw new Error(`Sin la fila de ${name}`);
  return row;
}

describe('AccessList: quién tiene acceso (spec 012b CA-1, CA-4, CA-5)', () => {
  it('CA-1: mientras carga lo anuncia', async () => {
    renderList(fakeSharingApi());

    expect(screen.getByRole('status').textContent).toContain('Cargando quién tiene acceso…');
    await act(async () => undefined);
  });

  it('CA-1: sin nadie, dice que todavía no se compartió', async () => {
    renderList(fakeSharingApi({ listAccess: jest.fn(() => listOf()) }));

    expect(await screen.findByText('Todavía no compartiste esto con nadie.')).toBeTruthy();
  });

  it('CA-1: cada persona con nombre, correo, nivel y origen; la heredada dice de qué carpeta viene', async () => {
    const api = fakeSharingApi({
      listAccess: jest.fn(() => listOf(directEntry(), INHERITED_ENTRY)),
    });
    renderList(api);

    await screen.findByText('Juan Cortés');
    const juan = personRow('Juan Cortés');
    expect(within(juan).getByText('juan@nimbo.gt')).toBeTruthy();
    expect(within(juan).getByText('Acceso directo')).toBeTruthy();
    const level = within(juan).getByRole('combobox', { name: 'Nivel de Juan Cortés' });
    expect(level.textContent).toBe('Editor');

    const laura = personRow('Laura Belmont');
    expect(within(laura).getByText('laura@nimbo.gt')).toBeTruthy();
    expect(within(laura).getByText('Lector')).toBeTruthy();
    expect(
      within(laura).getByText('Viene de «Proyecto Alpha». Quita el acceso desde esa carpeta.'),
    ).toBeTruthy();
    expect(within(laura).queryByRole('button', { name: /Quitar acceso/ })).toBeNull();
    expect(within(laura).queryByRole('combobox')).toBeNull();
    expect(api.listAccess).toHaveBeenCalledWith(NODE);
  });

  it('CA-1: si la lista no carga, ofrece reintentar', async () => {
    const listAccess = jest
      .fn<ReturnType<SharingApi['listAccess']>, Parameters<SharingApi['listAccess']>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(() => listOf(directEntry()));
    renderList(fakeSharingApi({ listAccess }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No pudimos cargar quién tiene acceso.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Juan Cortés')).toBeTruthy();
  });

  it('CA-4: cambiar el nivel lo aplica con POST /shares y la lista muestra el nuevo', async () => {
    const listAccess = jest
      .fn<ReturnType<SharingApi['listAccess']>, Parameters<SharingApi['listAccess']>>()
      .mockImplementationOnce(() => listOf(directEntry()))
      .mockImplementation(() => listOf(directEntry({ level: 'VIEWER' })));
    const share = jest.fn(() => Promise.resolve(directEntry({ level: 'VIEWER' })));
    renderList(fakeSharingApi({ listAccess, share }));

    const level = await screen.findByRole('combobox', { name: 'Nivel de Juan Cortés' });
    await userEvent.click(level);
    await userEvent.click(screen.getByRole('option', { name: 'Lector' }));

    expect(share).toHaveBeenCalledWith({ ...NODE, email: 'juan@nimbo.gt', level: 'VIEWER' });
    expect(await screen.findByText('Juan Cortés ahora es Lector.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Nivel de Juan Cortés' }).textContent).toBe(
        'Lector',
      ),
    );
  });

  it('CA-4: en solo lectura solo se ofrece bajar a Lector', async () => {
    const lector = directEntry({
      shareId: OTHER_SHARE_ID,
      level: 'VIEWER',
      grantee: { ...directEntry().grantee, id: INHERITED_ENTRY.grantee.id, displayName: 'Ana' },
    });
    renderList(fakeSharingApi({ listAccess: jest.fn(() => listOf(directEntry(), lector)) }), true);

    const juan = await screen.findByRole('combobox', { name: 'Nivel de Juan Cortés' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Nivel de Ana' }));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Editor' }).getAttribute('aria-disabled')).toBe(
        'true',
      ),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(juan);
    expect(screen.getByRole('option', { name: 'Lector' }).hasAttribute('aria-disabled')).toBe(
      false,
    );
  });

  it('CA-5: «Quitar acceso» confirma, quita y la persona desaparece de la lista', async () => {
    const listAccess = jest
      .fn<ReturnType<SharingApi['listAccess']>, Parameters<SharingApi['listAccess']>>()
      .mockImplementationOnce(() => listOf(directEntry()))
      .mockImplementation(() => listOf());
    const revoke = jest.fn(() => Promise.resolve());
    renderList(fakeSharingApi({ listAccess, revoke }));

    await userEvent.click(
      await screen.findByRole('button', { name: 'Quitar acceso de Juan Cortés' }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('¿Quitar el acceso de Juan Cortés?')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar acceso' }));

    expect(revoke).toHaveBeenCalledWith(SHARE_ID);
    expect(
      await screen.findByText('Quitamos el acceso. Esa persona ya no puede abrirlo.'),
    ).toBeTruthy();
    expect(screen.queryByText('Juan Cortés')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('CA-5: si el acceso ya no existe, lo dice y «Actualizar lista» relee', async () => {
    const listAccess = jest.fn(() => listOf(directEntry()));
    const revoke = jest.fn(() =>
      Promise.reject(new StorageRequestError(404, SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND)),
    );
    renderList(fakeSharingApi({ listAccess, revoke }));

    await userEvent.click(
      await screen.findByRole('button', { name: 'Quitar acceso de Juan Cortés' }),
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Quitar acceso' }),
    );

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Este acceso ya no existe. Actualiza la lista.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actualizar lista' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(listAccess).toHaveBeenCalledTimes(2);
  });
});
