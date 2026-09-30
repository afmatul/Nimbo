/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { NotFoundState } from './not-found-state';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const MESSAGE = 'No encontramos lo que buscas. Puede que no exista o que no tengas acceso.';

describe('NotFoundState (CA-17, CA-11)', () => {
  it('CA-11: muestra el mismo texto exista o no el recurso', () => {
    render(<NotFoundState role="CLIENT" />);

    expect(screen.getByRole('heading', { name: MESSAGE })).toBeTruthy();
  });

  it.each([
    ['CLIENT', '/archivos'],
    ['OPERATOR', '/interno'],
  ] as const)('CA-17: con rol %s, «Ir a mi inicio» lleva a %s', async (role, path) => {
    const user = userEvent.setup();
    render(<NotFoundState role={role} />);

    await user.click(screen.getByRole('button', { name: 'Ir a mi inicio' }));

    expect(push).toHaveBeenCalledWith(path);
  });

  it('CA-17: sin sesión, «Ir al inicio» lleva a la raíz', async () => {
    const user = userEvent.setup();
    render(<NotFoundState />);

    await user.click(screen.getByRole('button', { name: 'Ir al inicio' }));

    expect(push).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('button', { name: 'Ir a mi inicio' })).toBeNull();
  });

  it('CA-17: el foco va al título al montar', () => {
    render(<NotFoundState />);

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: MESSAGE }));
  });

  it('CA-17: la acción tiene un objetivo táctil de al menos 44 px', () => {
    render(<NotFoundState />);

    expect(screen.getByRole('button', { name: 'Ir al inicio' }).className).toContain('h-11');
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(<NotFoundState role="CLIENT" />);
    const results = await axe(view.container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
