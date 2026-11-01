/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SpaceProvider } from '../../storage/components/space-provider';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import type { SharingApi } from '../sharing-api';
import {
  fakeSharingApi,
  NODE_ID,
  PARENT_FOLDER_ID,
  RECEIVED_FOLDER,
  receivedShare,
  SHARED_AT,
} from '../test-sharing';

import { ReceivedSharesView } from './received-shares-view';

const received = (...entries: unknown[]) =>
  Promise.resolve({ entries }) as ReturnType<SharingApi['listReceived']>;

async function renderReceived(api: SharingApi, readOnly = false): Promise<void> {
  const summary = { ...spaceSummaryWith(3 * GB), readOnly };
  render(
    <SpaceProvider api={{ spaceSummary: () => Promise.resolve(summary) }} uploadedCount={0}>
      <ReceivedSharesView api={api} />
    </SpaceProvider>,
  );
  await act(async () => undefined);
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByRole('link', { name }).closest('tr');
  if (!row) throw new Error(`Sin la fila de ${name}`);
  return row;
}

describe('ReceivedSharesView: «Compartidos conmigo» (spec 012b CA-8, CA-9, CA-11)', () => {
  it('CA-8: mientras carga lo anuncia', async () => {
    await renderReceived(fakeSharingApi());

    expect(screen.getByRole('heading', { level: 1, name: 'Compartidos conmigo' })).toBeTruthy();
    const loading = screen
      .getAllByRole('status')
      .find((status) => status.textContent?.includes('Cargando lo que te compartieron…'));
    expect(loading).toBeTruthy();
  });

  it('CA-8: sin elementos, explica cómo llegan y ofrece ir a Mis archivos', async () => {
    await renderReceived(fakeSharingApi({ listReceived: jest.fn(() => received()) }));

    expect(screen.getByRole('heading', { name: 'Todavía no te han compartido nada' })).toBeTruthy();
    expect(
      screen.getByText(
        'Lo que compartan contigo aparecerá aquí. Para recibirlo, la otra persona debe compartir con el correo de tu cuenta.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
  });

  it('CA-8, CA-9: cada elemento con nombre, tipo, quién lo compartió, mi nivel y fecha; abre su carpeta o su ficha', async () => {
    await renderReceived(
      fakeSharingApi({ listReceived: jest.fn(() => received(receivedShare(), RECEIVED_FOLDER)) }),
    );

    expect(screen.getByText('2 elementos')).toBeTruthy();
    const docx = rowOf('Informe_trimestral_Q3.docx');
    expect(
      within(docx).getByRole('link', { name: 'Informe_trimestral_Q3.docx' }).getAttribute('href'),
    ).toBe(`/archivos/archivo/${NODE_ID}`);
    expect(within(docx).getAllByText('Andrea Morales').length).toBeGreaterThan(0);
    expect(within(docx).getAllByText('Editor').length).toBeGreaterThan(0);
    expect(docx.querySelector(`time[datetime="${SHARED_AT}"]`)).not.toBeNull();

    const folder = rowOf('Contratos 2026');
    expect(within(folder).getByRole('link', { name: 'Contratos 2026' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${PARENT_FOLDER_ID}`,
    );
    expect(within(folder).getAllByText('Carpeta').length).toBeGreaterThan(0);
    expect(within(folder).getAllByText('Lector').length).toBeGreaterThan(0);
  });

  it('CA-11: si la lista no carga, lo dice y «Reintentar» vuelve a pedirla', async () => {
    const listReceived = jest
      .fn<ReturnType<SharingApi['listReceived']>, []>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(() => received(receivedShare()));
    await renderReceived(fakeSharingApi({ listReceived }));

    expect(screen.getByRole('alert').textContent).toContain(
      'No pudimos cargar lo que te compartieron.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('link', { name: 'Informe_trimestral_Q3.docx' })).toBeTruthy();
    expect(listReceived).toHaveBeenCalledTimes(2);
  });
});
