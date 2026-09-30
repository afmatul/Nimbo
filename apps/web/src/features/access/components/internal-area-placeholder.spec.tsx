/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { InternalAreaPlaceholder } from './internal-area-placeholder';

describe('InternalAreaPlaceholder', () => {
  it('CA-17: saluda por nombre y anuncia el área del rol en minúsculas', () => {
    render(<InternalAreaPlaceholder fullName="Ana López" role="SUPPORT" onLogout={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Hola, Ana López.' })).toBeTruthy();
    expect(screen.getByText('Tu área de soporte estará disponible pronto.')).toBeTruthy();
  });

  it.each([
    ['ADMIN', 'administrador'],
    ['OPERATOR', 'operador'],
  ] as const)('CA-17: con %s nombra el área de %s', (role, label) => {
    render(<InternalAreaPlaceholder fullName="Ana López" role={role} onLogout={jest.fn()} />);

    expect(screen.getByText(`Tu área de ${label} estará disponible pronto.`)).toBeTruthy();
  });

  it('CA-17: «Cerrar sesión» llama a onLogout', async () => {
    const onLogout = jest.fn();
    const user = userEvent.setup();
    render(<InternalAreaPlaceholder fullName="Ana López" role="ADMIN" onLogout={onLogout} />);

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('CA-17: axe sin violaciones serias ni críticas', async () => {
    const { container } = render(
      <main>
        <InternalAreaPlaceholder fullName="Ana López" role="SUPPORT" onLogout={jest.fn()} />
      </main>,
    );

    const results = await axe(container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
