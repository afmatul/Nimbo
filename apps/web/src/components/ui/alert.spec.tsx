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

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(
      <div>
        <Alert variant="error">No pudimos guardar.</Alert>
        <Alert>Revisa tu correo.</Alert>
      </div>,
    );
  });
});
