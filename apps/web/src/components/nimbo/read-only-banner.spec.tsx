/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { ReadOnlyBanner } from './read-only-banner';

describe('ReadOnlyBanner (spec 010 CA-14, RF-23; ui-guidelines §4)', () => {
  it('CA-14: título, texto y «Renovar plan» hacia la renovación, como aviso de estado', async () => {
    const { container } = render(
      <ReadOnlyBanner
        title="Tu cuenta está en solo lectura."
        description="Puedes ver y descargar tus archivos, pero no subir ni editar."
        renewHref="/suscripcion/renovar"
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Tu cuenta está en solo lectura.');
    expect(screen.getByRole('link', { name: 'Renovar plan' }).getAttribute('href')).toBe(
      '/suscripcion/renovar',
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
