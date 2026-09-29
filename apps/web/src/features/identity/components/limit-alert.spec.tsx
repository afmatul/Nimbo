import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';

import { LimitAlert } from './limit-alert';

describe('LimitAlert', () => {
  it('anuncia el límite en tono de advertencia con ícono decorativo', () => {
    const markup = renderToStaticMarkup(<LimitAlert message="Ya te enviamos un enlace." />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('text-warning-foreground');
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(markup).toContain('Ya te enviamos un enlace.');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<LimitAlert message="Ya te enviamos un enlace." />);
  });
});
