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

  it('va en una tarjeta con ícono y el paso Verificación en curso', () => {
    render(<CheckEmailPanel email="ana@ejemplo.com" onChangeEmail={jest.fn()} />);

    const steps = screen.getByRole('list', { name: 'Pasos del registro' });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain('Verificación');
    expect(
      screen.getByRole('heading', { name: 'Revisa tu correo' }).closest('.shadow-card'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar correo' }).className).toContain('underline');
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(<CheckEmailPanel email="ana@ejemplo.com" onChangeEmail={jest.fn()} />);
    const results = await axe(view.container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });

  describe('variante de recuperación (spec 002 §11)', () => {
    it('CA-18: mensaje neutro de 1 hora, sin pasos del registro ni Cambiar correo', () => {
      render(<CheckEmailPanel variant="password-reset" email="ana@ejemplo.com" />);

      expect(screen.getByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe(
        'Si hay una cuenta con ana@ejemplo.com, te enviamos un enlace para restablecer tu contraseña. Vence en 1 hora.',
      );
      expect(screen.queryByRole('button', { name: 'Cambiar correo' })).toBeNull();
      expect(screen.queryByRole('list', { name: 'Pasos del registro' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(
        '/iniciar-sesion',
      );
    });

    it('no tiene violaciones graves de accesibilidad', async () => {
      const view = render(<CheckEmailPanel variant="password-reset" email="ana@ejemplo.com" />);
      const results = await axe(view.container);
      expect(
        results.violations.filter(
          (violation) => violation.impact === 'serious' || violation.impact === 'critical',
        ),
      ).toEqual([]);
    });
  });
});
