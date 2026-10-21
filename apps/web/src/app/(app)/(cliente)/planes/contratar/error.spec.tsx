/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ContratarError from './error';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('error de la pantalla de pago (spec 009 §6)', () => {
  it('error: dice que el catálogo no cargó y «Recargar» lo vuelve a pedir', async () => {
    const reset = jest.fn();
    render(<ContratarError error={new Error('x')} reset={reset} />);

    expect(screen.getByRole('alert').textContent).toContain('No pudimos cargar los planes.');
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
