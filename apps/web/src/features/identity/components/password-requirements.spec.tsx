import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../../../components/test-a11y';

import { PasswordRequirements } from './password-requirements';

const EMAIL = 'ana@ejemplo.com';

const render = (password: string, email = EMAIL): string =>
  renderToStaticMarkup(<PasswordRequirements password={password} email={email} />);

describe('PasswordRequirements', () => {
  it('lista solo los requisitos de composición, con texto para lectores', () => {
    const markup = render('Corta1!');

    expect(markup).toContain('12 caracteres o más');
    expect(markup).toContain('Una mayúscula');
    expect(markup).toContain('Un número');
    expect(markup).toContain('Un símbolo');
    expect(markup).toContain(': cumple');
    expect(markup).toContain(': falta');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('no muestra la longitud máxima, «común» ni «correo» como requisitos', () => {
    const markup = render('Nimbo-Seguro-2026');

    expect(markup).not.toMatch(/caracteres o menos|como máximo/);
    expect(markup).not.toContain('contraseña común');
    expect(markup).not.toContain('correo');
    expect(markup).not.toContain('role="alert"');
  });

  it('anuncia la seguridad con aria-live: vacía, débil, media y fuerte', () => {
    expect(render('')).toContain('Seguridad: Escribe una contraseña');
    expect(render('abc')).toContain('Seguridad: Débil');
    expect(render('Corta1!')).toContain('Seguridad: Media');
    expect(render('Nimbo-Seguro-2026')).toContain('Seguridad: Fuerte');
    expect(render('Nimbo-Seguro-2026')).toMatch(/aria-live="polite"[^>]*>.*4 de 4 requisitos/s);
  });

  it('si la contraseña es común, lo explica como error aunque cumpla la lista', () => {
    const markup = render('G00dPa$$w0rd');

    expect(markup).toMatch(
      /role="alert"[^>]*>.*Esta contraseña es muy común y fácil de adivinar\./s,
    );
  });

  it('si la contraseña es igual al correo conocido, lo explica como error', () => {
    const markup = render('Ana@Ejemplo.com1', 'ana@ejemplo.com1');

    expect(markup).toContain('Tu contraseña no puede ser tu correo.');
  });

  it('sin nada escrito no muestra errores: los pendientes van en gris', () => {
    const markup = render('', '');

    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain('text-destructive');
  });

  it('colorea con tokens semánticos además del ícono', () => {
    const markup = render('Corta1!');

    expect(markup).toContain('text-success-foreground');
    expect(markup).toContain('text-destructive');
    expect(markup).toContain('bg-warning');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PasswordRequirements password="" email="" />);
    await expectNoA11yViolations(<PasswordRequirements password="G00dPa$$w0rd" email={EMAIL} />);
  });
});
