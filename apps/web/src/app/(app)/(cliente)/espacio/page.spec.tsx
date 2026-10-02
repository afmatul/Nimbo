/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';

import { SessionProvider } from '../../../../features/identity/session/session-provider';

import EspacioPage from './page';

describe('página Espacio (/espacio)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  });

  it('CA-1: con los datos de ejemplo muestra el resumen y el desglose', () => {
    render(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <EspacioPage />
      </SessionProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Espacio de almacenamiento' }),
    ).toBeTruthy();
    const usage = screen.getByRole('region', { name: 'Espacio usado' });
    expect(within(usage).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('32');
    expect(screen.getByRole('region', { name: 'En qué se va tu espacio' })).toBeTruthy();
  });
});
