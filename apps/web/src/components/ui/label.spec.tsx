import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';

import { Label } from './label';

describe('Label', () => {
  it('asocia el texto con el control por htmlFor', () => {
    const markup = renderToStaticMarkup(<Label htmlFor="correo">Correo</Label>);
    expect(markup).toContain('for="correo"');
    expect(markup).toContain('Correo');
    expect(markup).toContain('text-foreground');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(
      <form>
        <Label htmlFor="correo">Correo</Label>
        <input id="correo" />
      </form>,
    );
  });
});
