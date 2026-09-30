/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import NotFound from './not-found';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('app/not-found (CA-17, CA-11)', () => {
  it('CA-17: muestra NotFoundState con «Ir al inicio» porque la raíz no tiene sesión', () => {
    render(<NotFound />);

    expect(
      screen.getByRole('heading', {
        name: 'No encontramos lo que buscas. Puede que no exista o que no tengas acceso.',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(<NotFound />);
    const results = await axe(view.container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
