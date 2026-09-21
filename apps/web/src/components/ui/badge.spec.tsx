import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Badge } from './badge';

describe('Badge component (CA-4)', () => {
  it('renderiza Badge con variante por defecto y radio rounded-sm (6px)', () => {
    const markup = renderToStaticMarkup(<Badge>Activo</Badge>);
    expect(markup).toContain('bg-primary');
    expect(markup).toContain('text-primary-foreground');
    expect(markup).toContain('rounded-sm');
    expect(markup).toContain('Activo');
  });

  it('renderiza variantes semánticas con textos contrastados', () => {
    const successMarkup = renderToStaticMarkup(<Badge variant="success">Completado</Badge>);
    expect(successMarkup).toContain('text-success-foreground');

    const warningMarkup = renderToStaticMarkup(<Badge variant="warning">Al 80%</Badge>);
    expect(warningMarkup).toContain('text-warning-foreground');

    const destructiveMarkup = renderToStaticMarkup(<Badge variant="destructive">Error</Badge>);
    expect(destructiveMarkup).toContain('bg-destructive');
    expect(destructiveMarkup).toContain('text-white');
  });
});
