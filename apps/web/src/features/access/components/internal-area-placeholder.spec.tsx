/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { InternalAreaPlaceholder } from './internal-area-placeholder';

describe('InternalAreaPlaceholder', () => {
  it('CA-17: saluda por nombre y anuncia el área del rol en minúsculas', () => {
    render(<InternalAreaPlaceholder fullName="Ana López" role="SUPPORT" />);

    expect(screen.getByRole('heading', { name: 'Hola, Ana López.' })).toBeTruthy();
    expect(screen.getByText('Tu área de soporte estará disponible pronto.')).toBeTruthy();
  });

  it.each([
    ['ADMIN', 'administrador'],
    ['OPERATOR', 'operador'],
  ] as const)('CA-17: con %s nombra el área de %s', (role, label) => {
    render(<InternalAreaPlaceholder fullName="Ana López" role={role} />);

    expect(screen.getByText(`Tu área de ${label} estará disponible pronto.`)).toBeTruthy();
  });

  it('CA-17: no trae acción propia: «Cerrar sesión» está en el menú de la cuenta', () => {
    render(<InternalAreaPlaceholder fullName="Ana López" role="ADMIN" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CA-17: axe sin violaciones serias ni críticas', async () => {
    const { container } = render(
      <main>
        <InternalAreaPlaceholder fullName="Ana López" role="SUPPORT" />
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
