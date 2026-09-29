import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';

import { SignupSteps } from './signup-steps';

function itemsOf(markup: string): string[] {
  return [...markup.matchAll(/<li[^>]*>.*?<\/li>/gs)].map((match) => match[0]);
}

describe('SignupSteps', () => {
  it('muestra Cuenta, Verificación y Listo en una lista ordenada', () => {
    const markup = renderToStaticMarkup(<SignupSteps current={1} />);

    expect(markup).toMatch(/^<ol aria-label="Pasos del registro"/);
    expect(itemsOf(markup)).toHaveLength(3);
    expect(markup).toContain('Cuenta');
    expect(markup).toContain('Verificación');
    expect(markup).toContain('Listo');
  });

  it('marca el paso actual con aria-current y los anteriores como completados', () => {
    const [cuenta, verificacion, listo] = itemsOf(
      renderToStaticMarkup(<SignupSteps current={2} />),
    );

    expect(cuenta).toContain('(completado)');
    expect(cuenta).not.toContain('aria-current');
    expect(verificacion).toContain('aria-current="step"');
    expect(verificacion).not.toContain('(completado)');
    expect(listo).not.toContain('aria-current');
    expect(listo).not.toContain('(completado)');
  });

  it('en Listo, los tres pasos quedan completados', () => {
    const items = itemsOf(renderToStaticMarkup(<SignupSteps current={3} />));

    expect(items.every((item) => item.includes('(completado)'))).toBe(true);
    expect(items[2]).toContain('aria-current="step"');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<SignupSteps current={2} />);
  });
});
