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

  it('con las reglas cumplidas usa rótulos positivos para contraseña común y correo', () => {
    const markup = renderToStaticMarkup(
      <PasswordRequirements password="Nimbo-Seguro-2026" email="ana@ejemplo.com" />,
    );

    expect(markup).toContain('No es una contraseña común');
    expect(markup).toContain('Es distinta de tu correo');
    expect(markup).not.toContain('muy común');
    expect(markup).not.toContain('no puede ser tu correo');
    expect(markup).not.toContain('Falta');
  });

  it('si la contraseña es común o igual al correo, explica el motivo junto a Falta', () => {
    const common = renderToStaticMarkup(
      <PasswordRequirements password="G00dPa$$w0rd" email="ana@ejemplo.com" />,
    );
    const sameAsEmail = renderToStaticMarkup(
      <PasswordRequirements password="Ana@Ejemplo.com1" email="ana@ejemplo.com1" />,
    );

    expect(common).toContain('Esta contraseña es muy común y fácil de adivinar.');
    expect(sameAsEmail).toContain('Tu contraseña no puede ser tu correo.');
  });

  it('colorea Cumple y Falta con tokens semánticos además del ícono', () => {
    const markup = renderToStaticMarkup(
      <PasswordRequirements password="Corta1!" email="ana@ejemplo.com" />,
    );

    expect(markup).toMatch(/text-success-foreground[^>]*>Cumple</);
    expect(markup).toMatch(/text-destructive[^>]*>Falta</);
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PasswordRequirements password="" email="" />);
  });
});
