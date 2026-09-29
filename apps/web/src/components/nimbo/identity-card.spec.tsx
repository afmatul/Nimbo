import { Mail } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';

import { IdentityCard } from './identity-card';

describe('IdentityCard', () => {
  it('pone el título en un h1 ligado a la sección, con ícono decorativo dentro de una tarjeta', () => {
    const markup = renderToStaticMarkup(
      <IdentityCard titleId="revisa-correo" title="Revisa tu correo" icon={Mail} tone="info">
        <p>Contenido</p>
      </IdentityCard>,
    );

    expect(markup).toContain('aria-labelledby="revisa-correo"');
    expect(markup).toMatch(/<h1 id="revisa-correo"[^>]*>Revisa tu correo<\/h1>/);
    expect(markup).toContain('shadow-card');
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(markup).toContain('Contenido');
    expect(markup).not.toContain('Pasos del registro');
  });

  it('muestra los pasos del registro cuando se indica el paso', () => {
    const markup = renderToStaticMarkup(
      <IdentityCard titleId="t" title="Revisa tu correo" icon={Mail} tone="info" step={2}>
        <p>Contenido</p>
      </IdentityCard>,
    );

    expect(markup).toContain('Pasos del registro');
    expect(markup.indexOf('Pasos del registro')).toBeLessThan(markup.indexOf('<h1'));
  });

  it.each([
    ['success', 'text-success-foreground'],
    ['warning', 'text-warning-foreground'],
    ['danger', 'text-destructive'],
    ['info', 'text-primary'],
  ] as const)('el tono %s colorea el ícono con tokens', (tone, token) => {
    const markup = renderToStaticMarkup(
      <IdentityCard titleId="t" title="Título" icon={Mail} tone={tone} />,
    );
    expect(markup).toContain(token);
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(
      <IdentityCard titleId="t" title="Revisa tu correo" icon={Mail} tone="info" step={2}>
        <p>Contenido</p>
      </IdentityCard>,
    );
  });
});
