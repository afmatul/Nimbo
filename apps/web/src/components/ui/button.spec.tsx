import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button } from './button';

describe('Button component (CA-4)', () => {
  it('renderiza la variante por defecto con tokens primarios de Cielo Sereno', () => {
    const markup = renderToStaticMarkup(<Button>Acción Principal</Button>);
    expect(markup).toContain('bg-primary');
    expect(markup).toContain('text-primary-foreground');
    expect(markup).toContain('hover:bg-primary-hover');
    expect(markup).toContain('Acción Principal');
  });

  it('renderiza la variante destructiva con el token accesible de peligro', () => {
    const markup = renderToStaticMarkup(<Button variant="destructive">Eliminar</Button>);
    expect(markup).toContain('bg-destructive');
    expect(markup).toContain('text-white');
    expect(markup).toContain('Eliminar');
  });

  it('renderiza la variante outline con borde accesible', () => {
    const markup = renderToStaticMarkup(<Button variant="outline">Cancelar</Button>);
    expect(markup).toContain('border');
    expect(markup).toContain('Cancelar');
  });

  it('soporta estado de carga con aria-busy y deshabilitado', () => {
    const markup = renderToStaticMarkup(<Button loading>Guardando</Button>);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('animate-spin');
    expect(markup).toContain('Guardando');
  });

  it('aplica clases de foco accesible (focus-visible)', () => {
    const markup = renderToStaticMarkup(<Button>Foco</Button>);
    expect(markup).toContain('focus-visible:ring-2');
    expect(markup).toContain('focus-visible:ring-ring');
  });
});
