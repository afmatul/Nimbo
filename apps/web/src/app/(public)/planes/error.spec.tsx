/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PlanesError from './error';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('error de la página de planes (008 CA-3)', () => {
  it('CA-3: muestra el mensaje del catálogo no disponible', () => {
    render(<PlanesError error={new Error('x')} reset={jest.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'No pudimos cargar los planes. Intenta recargar la página.',
    );
  });

  it('CA-3: «Recargar» vuelve a pedir el catálogo al servidor', async () => {
    const reset = jest.fn();
    render(<PlanesError error={new Error('x')} reset={reset} />);

    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
