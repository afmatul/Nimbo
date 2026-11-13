/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import AccessLayout from './layout';

describe('marco de iniciar sesión (mockup p. 07)', () => {
  it('ocupa toda la pantalla sin la cabecera pública: la página trae su propia barra superior', () => {
    render(
      <AccessLayout>
        <p>contenido</p>
      </AccessLayout>,
    );

    expect(screen.getByRole('main').textContent).toBe('contenido');
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Navegación pública' })).toBeNull();
  });
});
