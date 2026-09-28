import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('asocia la etiqueta, marca el error y describe el mensaje', () => {
    const markup = renderToStaticMarkup(
      <Checkbox id="terminos" label="Acepto los términos" error errorMessage="Marca la casilla" />,
    );

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('id="terminos"');
    expect(markup).toContain('for="terminos"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="terminos-error"');
    expect(markup).toContain('id="terminos-error"');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('focus-visible:ring-2');
    expect(markup).toContain('Acepto los términos');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<Checkbox label="Acepto los términos" />);
  });
});
