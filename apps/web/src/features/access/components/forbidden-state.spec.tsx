/**
 * @jest-environment jsdom
 */
import { SUPPORT_CONTACT_EMAIL } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ForbiddenState } from './forbidden-state';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('ForbiddenState (CA-17)', () => {
  it('CA-17: muestra «Sin permiso» con el texto de §11 y el correo de soporte', () => {
    render(<ForbiddenState role="CLIENT" />);

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
    expect(
      screen.getByText(
        `No tienes permiso para ver esta página. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
      ),
    ).toBeTruthy();
  });

  it('CA-17: muestra un ícono de candado', () => {
    const view = render(<ForbiddenState role="CLIENT" />);

    expect(view.container.querySelector('svg.lucide-lock')).toBeTruthy();
  });

  it.each([
    ['CLIENT', '/archivos'],
    ['SUPPORT', '/interno'],
  ] as const)('CA-17: «Ir a mi inicio» lleva a %s → %s', async (role, path) => {
    const user = userEvent.setup();
    render(<ForbiddenState role={role} />);

    await user.click(screen.getByRole('button', { name: 'Ir a mi inicio' }));

    expect(push).toHaveBeenCalledWith(path);
  });

  it('CA-17: el foco va al título al montar', () => {
    render(<ForbiddenState role="ADMIN" />);

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Sin permiso' }));
  });

  it('CA-17: la acción tiene un objetivo táctil de al menos 44 px', () => {
    render(<ForbiddenState role="CLIENT" />);

    expect(screen.getByRole('button', { name: 'Ir a mi inicio' }).className).toContain('h-11');
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(<ForbiddenState role="CLIENT" />);
    const results = await axe(view.container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
