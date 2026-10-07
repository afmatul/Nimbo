import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';

import { Alert } from './alert';

describe('Alert', () => {
  it('anuncia un error con role alert', () => {
    const markup = renderToStaticMarkup(<Alert variant="error">No pudimos guardar.</Alert>);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('text-destructive');
    expect(markup).toContain('No pudimos guardar.');
  });

  it('anuncia un aviso informativo con role status', () => {
    const markup = renderToStaticMarkup(<Alert variant="info">Revisa tu correo.</Alert>);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('border-border');
  });

  it('anuncia una advertencia con role status y tokens de advertencia', () => {
    const markup = renderToStaticMarkup(<Alert variant="warning">Espera un momento.</Alert>);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('text-warning-foreground');
    expect(markup).toContain('border-warning');
  });

  it('anuncia un aviso crítico con role alert sobre fondo destructive-soft, sin cambiar error', () => {
    const markup = renderToStaticMarkup(<Alert variant="critical">Espacio casi agotado.</Alert>);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('bg-destructive-soft/10');
    expect(markup).toContain('text-destructive');
    expect(renderToStaticMarkup(<Alert variant="error">x</Alert>)).toContain('bg-card');
  });

  it('anuncia un éxito con role status y tokens de éxito', () => {
    const markup = renderToStaticMarkup(<Alert variant="success">Listo.</Alert>);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('border-success');
    expect(markup).toContain('bg-success/10');
    expect(markup).toContain('text-foreground');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(
      <div>
        <Alert variant="error">No pudimos guardar.</Alert>
        <Alert>Revisa tu correo.</Alert>
        <Alert variant="warning">Espera un momento.</Alert>
        <Alert variant="critical">Espacio casi agotado.</Alert>
        <Alert variant="success">Listo.</Alert>
      </div>,
    );
  });
});
