/**
 * @jest-environment jsdom
 */
import type { SpaceSummaryResponse } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { SpaceProvider } from '../../../../features/storage/components/space-provider';
import type { SpaceApi } from '../../../../features/storage/space-api';
import { GB, spaceSummaryWith } from '../../../../features/storage/test-space-summary';

import EspacioPage from './page';

async function renderPage(api: SpaceApi): Promise<void> {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SpaceProvider api={api} uploadedCount={0}>
        <EspacioPage />
      </SpaceProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

function main(): HTMLElement {
  return screen.getByRole('main');
}

describe('página Espacio (/espacio)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  });

  it('CA-1: muestra el resumen que entrega la API con el desglose', async () => {
    await renderPage({ spaceSummary: jest.fn(() => Promise.resolve(spaceSummaryWith(4.8 * GB))) });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Espacio de almacenamiento' }),
    ).toBeTruthy();
    const usage = screen.getByRole('region', { name: 'Espacio usado' });
    expect(within(usage).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('32');
    expect(screen.getByRole('region', { name: 'En qué se va tu espacio' })).toBeTruthy();
  });

  it('CA-8: si falla muestra la causa y «Reintentar» vuelve a pedir el resumen', async () => {
    const spaceSummary = jest
      .fn<Promise<SpaceSummaryResponse>, []>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(spaceSummaryWith(4.8 * GB));
    await renderPage({ spaceSummary });

    const error = within(main()).getByRole('alert');
    expect(error.textContent).toContain(
      'No pudimos calcular tu espacio.Tus archivos siguen guardados.',
    );
    await userEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(spaceSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Espacio usado' })).toBeTruthy();
  });
});
