import { capitalize, quantity } from './quantity';

describe('quantity (011, concordancia con la cantidad)', () => {
  it('la cifra usa el separador de miles del catálogo', () => {
    expect(quantity(1).text).toBe('1');
    expect(quantity(12).text).toBe('12');
    // El separador del catálogo es un espacio inseparable (U+00A0), como en `formatCount`.
    expect(quantity(1284).text).toBe('1 284');
  });

  it('la frase concuerda el artículo y el sustantivo', () => {
    expect(quantity(1).phrase('cuenta', 'cuentas')).toBe('la 1 cuenta');
    expect(quantity(12).phrase('cuenta', 'cuentas')).toBe('las 12 cuentas');
    expect(quantity(0).phrase('cuenta', 'cuentas')).toBe('las 0 cuentas');
  });

  it('el sustantivo, el verbo y el pronombre siguen al número', () => {
    expect(quantity(1).form('tiene', 'tienen')).toBe('tiene');
    expect(quantity(1).form('ella', 'ellas')).toBe('ella');
    expect(quantity(2).form('tiene', 'tienen')).toBe('tienen');
    expect(quantity(2).form('ella', 'ellas')).toBe('ellas');
  });

  it('capitalize sube la primera letra, para empezar una oración', () => {
    expect(capitalize('las 12 cuentas internas no tienen plan')).toBe(
      'Las 12 cuentas internas no tienen plan',
    );
    expect(capitalize('La 1 cuenta interna')).toBe('La 1 cuenta interna');
  });
});
