import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';
import { ApiClientError } from '../../../lib/api-error';

import { ServerErrorAlert } from './server-error-alert';

function serverError(code: string, correlationId: string): ApiClientError {
  return new ApiClientError({ code, message: 'Falla', correlationId });
}

describe('ServerErrorAlert', () => {
  it('como el mockup error-servidor: recuadro de error con ícono, título en negrita y mensaje', () => {
    const markup = renderToStaticMarkup(
      <ServerErrorAlert
        title="No pudimos crear tu cuenta."
        error={serverError('INTERNAL_ERROR', 'corr-1')}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-state="error-servidor"');
    expect(markup).toContain('border-destructive');
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(markup).toMatch(/<strong[^>]*>No pudimos crear tu cuenta\.<\/strong>/);
    expect(markup).toContain('comparte este código con soporte: corr-1');
  });

  it('no repite el código cuando el mensaje ya lo trae', () => {
    const markup = renderToStaticMarkup(
      <ServerErrorAlert error={serverError('INTERNAL_ERROR', 'corr-2')} />,
    );

    expect(markup.split('corr-2')).toHaveLength(2);
  });

  it('muestra el código aparte cuando el mensaje no lo trae', () => {
    const markup = renderToStaticMarkup(
      <ServerErrorAlert error={serverError('IDENTITY_INVALID_INPUT', 'corr-3')} />,
    );

    expect(markup).toContain('Código: corr-3');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(
      <ServerErrorAlert title="No pudimos crear tu cuenta." error={serverError('X', 'corr-4')} />,
    );
  });
});
