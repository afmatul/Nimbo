import { renderToStaticMarkup } from 'react-dom/server';

import { Input } from './input';

describe('Input component (CA-4, DF-45)', () => {
  it('renderiza input con borde accesible border-input (#7F93AA) y fondo bg-card', () => {
    const markup = renderToStaticMarkup(<Input placeholder="Buscar archivos..." />);
    expect(markup).toContain('border-input');
    expect(markup).toContain('bg-card');
    expect(markup).toContain('placeholder="Buscar archivos..."');
    expect(markup).toContain('rounded-md');
  });

  it('aplica foco accesible con anillo ring-ring', () => {
    const markup = renderToStaticMarkup(<Input />);
    expect(markup).toContain('focus-visible:ring-2');
    expect(markup).toContain('focus-visible:ring-ring');
  });

  it('soporta estado de error con aria-invalid y borde destructivo', () => {
    const markup = renderToStaticMarkup(<Input error aria-errormessage="error-correo" />);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('border-destructive');
    expect(markup).toContain('focus-visible:ring-destructive');
  });

  it('respeta atributo disabled con opacidad reducida', () => {
    const markup = renderToStaticMarkup(<Input disabled />);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('disabled:opacity-45');
  });
});
