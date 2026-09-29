import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';

import { TextLink } from './text-link';

describe('TextLink', () => {
  it('se distingue por subrayado y tiene foco visible', () => {
    const markup = renderToStaticMarkup(<TextLink href="/terminos">Términos</TextLink>);

    expect(markup).toContain('href="/terminos"');
    expect(markup).toContain('underline');
    expect(markup).toContain('focus-visible:ring-2');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<TextLink href="/terminos">Términos</TextLink>);
  });
});
