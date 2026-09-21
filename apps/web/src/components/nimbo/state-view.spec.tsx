import { renderToStaticMarkup } from 'react-dom/server';

import { StateView } from './state-view';

describe('StateView component (CA-4, RNF-14)', () => {
  it('renderiza estado vacío (empty) con título, descripción y acción', () => {
    const markup = renderToStaticMarkup(
      <StateView
        type="empty"
        title="Sin archivos"
        description="Esta carpeta aún no tiene documentos."
        action={{ label: 'Subir archivo', onClick: () => {} }}
      />,
    );

    expect(markup).toContain('Sin archivos');
    expect(markup).toContain('Esta carpeta aún no tiene documentos.');
    expect(markup).toContain('Subir archivo');
    expect(markup).toContain('text-muted-foreground');
  });

  it('renderiza estado de carga (loading) con aria-live y spinner', () => {
    const markup = renderToStaticMarkup(
      <StateView type="loading" title="Cargando tus archivos..." />,
    );

    expect(markup).toContain('Cargando tus archivos...');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('animate-spin');
  });

  it('renderiza estado de error (error) con acción correctiva obligatoria (RNF-14)', () => {
    const markup = renderToStaticMarkup(
      <StateView
        type="error"
        title="Error al sincronizar"
        description="No fue posible conectar con el servidor. Revisa tu conexión."
        action={{ label: 'Reintentar', onClick: () => {} }}
      />,
    );

    expect(markup).toContain('Error al sincronizar');
    expect(markup).toContain('No fue posible conectar con el servidor.');
    expect(markup).toContain('Reintentar');
    expect(markup).toContain('text-destructive');
    expect(markup).toContain('role="alert"');
  });
});
