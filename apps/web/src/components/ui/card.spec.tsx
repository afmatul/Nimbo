import { renderToStaticMarkup } from 'react-dom/server';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

describe('Card component (CA-4)', () => {
  it('renderiza Card con tokens de Cielo Sereno: bg-card, border-border, rounded-lg, shadow-card', () => {
    const markup = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>Título de Tarjeta</CardTitle>
          <CardDescription>Descripción breve</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Contenido principal</p>
        </CardContent>
        <CardFooter>
          <span>Pie de tarjeta</span>
        </CardFooter>
      </Card>,
    );

    expect(markup).toContain('bg-card');
    expect(markup).toContain('border-border');
    expect(markup).toContain('rounded-lg');
    expect(markup).toContain('shadow-card');
    expect(markup).toContain('Título de Tarjeta');
    expect(markup).toContain('Descripción breve');
    expect(markup).toContain('text-muted-foreground');
  });
});
