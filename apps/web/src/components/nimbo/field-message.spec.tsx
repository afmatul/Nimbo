/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { FieldMessage } from './field-message';

describe('FieldMessage (Art. XIII.4)', () => {
  it('muestra el texto con el id que enlaza el campo, sin anunciarse por omisión', () => {
    render(<FieldMessage id="nombre-error">Escribe un nombre.</FieldMessage>);

    const message = screen.getByText('Escribe un nombre.').closest('p');
    expect(message?.id).toBe('nombre-error');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con `alert` se anuncia al aparecer', () => {
    render(
      <FieldMessage id="clave-error" alert>
        Escribe la contraseña del enlace.
      </FieldMessage>,
    );

    expect(screen.getByRole('alert').textContent).toBe('Escribe la contraseña del enlace.');
  });

  it('el ícono es decorativo y la clase extra se suma a la base', () => {
    const { container } = render(
      <FieldMessage id="x-error" className="mt-1.5">
        Revisa el valor.
      </FieldMessage>,
    );

    const message = container.querySelector('p');
    expect(message?.className).toContain('mt-1.5');
    expect(message?.className).toContain('text-destructive');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
