import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';
import { formatLegalDate } from '../../../features/identity/components/legal-document';
import TerminosPage from './page';

function assertLocalLinks(markup: string): void {
  const hrefs = markup.match(/href="[^"]+"/g) ?? [];
  const srcs = markup.match(/src="[^"]+"/g) ?? [];
  for (const value of [...hrefs, ...srcs]) {
    expect(value.startsWith('href="mailto:') || value.startsWith('href="/') || value.startsWith('src="/')).toBe(
      true,
    );
  }
}

describe('Términos', () => {
  it('muestra la versión y la fecha de LEGAL_DOCUMENTS y los puntos del plan', () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain(`Versión ${LEGAL_DOCUMENTS.terms.version}`);
    expect(markup).toContain(formatLegalDate(LEGAL_DOCUMENTS.terms.effectiveDate));
    expect(markup).toContain('proyecto académico');
    expect(markup).toContain('18 años o más');
    expect(markup).toContain('Los pagos son simulados');
    expect(markup).toContain('noviembre de 2026');
    expect(markup).toContain('mailto:amatultab@gmail.com');
    assertLocalLinks(markup);
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<TerminosPage />);
  });
});
