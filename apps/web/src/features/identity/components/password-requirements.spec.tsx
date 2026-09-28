import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';
import { PasswordRequirements } from './password-requirements';

describe('PasswordRequirements', () => {
  it('marca cada regla con ícono y texto Cumple o Falta', () => {
    const markup = renderToStaticMarkup(
      <PasswordRequirements password="Corta1!" email="ana@ejemplo.com" />,
    );

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('12 caracteres o más');
    expect(markup).toContain('Una mayúscula');
    expect(markup).toContain('Un número');
    expect(markup).toContain('Un símbolo');
    expect(markup).toContain('Cumple');
    expect(markup).toContain('Falta');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PasswordRequirements password="" email="" />);
  });
});
