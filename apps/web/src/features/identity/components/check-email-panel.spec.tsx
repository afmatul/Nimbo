/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { PublicHeader } from '../../../components/nimbo/public-header';
import { CheckEmailPanel } from './check-email-panel';

describe('CheckEmailPanel', () => {
  it('muestra el correo, las 24 horas y Cambiar correo, sin casillas de código ni sesión en la cabecera', async () => {
    const user = userEvent.setup();
    const onChangeEmail = jest.fn();
    render(
      <>
        <PublicHeader />
        <CheckEmailPanel email="ana@ejemplo.com" onChangeEmail={onChangeEmail} />
      </>,
    );

    expect(screen.getByText(/ana@ejemplo.com/)).toBeTruthy();
    expect(screen.getByText(/24 horas/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();

    const header = screen.getByRole('banner');
    expect(header.textContent).not.toContain('ana@ejemplo.com');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    expect(onChangeEmail).toHaveBeenCalledTimes(1);
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(<CheckEmailPanel email="ana@ejemplo.com" onChangeEmail={jest.fn()} />);
    const results = await axe(view.container);
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  });
});
