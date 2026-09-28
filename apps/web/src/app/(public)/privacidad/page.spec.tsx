import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';
import { formatLegalDate } from '../../../features/identity/components/legal-document';
import PrivacidadPage from './page';

describe('Política de privacidad', () => {
  it('muestra la versión y la fecha de LEGAL_DOCUMENTS y los puntos del plan', () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain(`Versión ${LEGAL_DOCUMENTS.privacy.version}`);
    expect(markup).toContain(formatLegalDate(LEGAL_DOCUMENTS.privacy.effectiveDate));
    expect(markup).toContain('proyecto académico');
    expect(markup).toContain('18 años o más');
    expect(markup).toContain('Los pagos son simulados');
    expect(markup).toContain('noviembre de 2026');
    expect(markup).toContain('mailto:amatultab@gmail.com');
    expect(markup).not.toContain('..');
    const hrefs = markup.match(/href="[^"]+"/g) ?? [];
    for (const href of hrefs) expect(href.startsWith('href="mailto:') || href.startsWith('href="/')).toBe(true);
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PrivacidadPage />);
  });
});
