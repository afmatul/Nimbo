import { BIGINT_TRANSFORMER } from './bigint.transformer';

describe('BIGINT_TRANSFORMER (RN-11: bytes siempre `bigint`)', () => {
  it('RN-11: el texto que devuelve `pg` para `bigint` llega como `bigint`, nunca como `number`', () => {
    const value = BIGINT_TRANSFORMER.from('9007199254740993');

    expect(typeof value).toBe('bigint');
    expect(value).toBe(9_007_199_254_740_993n);
  });

  it('RN-11: un `bigint` va a la base como texto decimal exacto (sin pasar por `number`)', () => {
    expect(BIGINT_TRANSFORMER.to(9_007_199_254_740_993n)).toBe('9007199254740993');
  });

  it('RN-11: `null` y `undefined` (columnas opcionales) pasan sin cambio', () => {
    expect(BIGINT_TRANSFORMER.from(null)).toBeNull();
    expect(BIGINT_TRANSFORMER.to(null)).toBeNull();
    expect(BIGINT_TRANSFORMER.to(undefined)).toBeUndefined();
  });

  it('RN-11: un valor que no es entero no se convierte en silencio', () => {
    expect(() => BIGINT_TRANSFORMER.from('1.5')).toThrow(SyntaxError);
  });
});
