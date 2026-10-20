import {
  amountAndUnit,
  bytesOf,
  centsOf,
  integerOf,
  MAX_FILE_UNITS,
  QUOTA_UNITS,
} from './plan-form-values';

describe('valores del formulario de un plan (011 CA-9, CA-11)', () => {
  it('centsOf: el precio con punto o con coma da los mismos centavos', () => {
    expect(centsOf('125.00')).toBe(12500);
    expect(centsOf('125,00')).toBe(12500);
    expect(centsOf('125,50')).toBe(12550);
    expect(centsOf('0.00')).toBe(0);
  });

  it('centsOf: lo que no es un precio no se traduce (N-2: la coma no es de miles)', () => {
    expect(centsOf('1.250')).toBeNull();
    expect(centsOf('1,250')).toBeNull();
    expect(centsOf('125.5.0')).toBeNull();
    expect(centsOf('abc')).toBeNull();
    expect(centsOf('')).toBeNull();
  });

  it('integerOf: solo los enteros no negativos', () => {
    expect(integerOf('5')).toBe(5);
    expect(integerOf(' 5 ')).toBe(5);
    expect(integerOf('0')).toBe(0);
    expect(integerOf('5.5')).toBeNull();
    expect(integerOf('-5')).toBeNull();
    expect(integerOf('')).toBeNull();
  });

  it('bytesOf: el número con su unidad, en bytes (base 1024, la del catálogo)', () => {
    expect(bytesOf('500', 'GB')).toBe(String(500 * 1024 ** 3));
    expect(bytesOf('500', 'MB')).toBe(String(500 * 1024 ** 2));
    expect(bytesOf('1', 'TB')).toBe(String(1024 ** 4));
    expect(bytesOf('abc', 'GB')).toBeNull();
  });

  it('amountAndUnit: elige la unidad en la que el número sale entero', () => {
    expect(amountAndUnit(500 * 1024 ** 2, QUOTA_UNITS)).toEqual({ amount: '0.5', unit: 'GB' });
    expect(amountAndUnit(100 * 1024 ** 3, QUOTA_UNITS)).toEqual({ amount: '100', unit: 'GB' });
    expect(amountAndUnit(500 * 1024 ** 2, MAX_FILE_UNITS)).toEqual({ amount: '500', unit: 'MB' });
  });
});
