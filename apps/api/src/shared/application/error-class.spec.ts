import { errorClassOf } from './error-class';

class QuotaProbeError extends Error {}

describe('errorClassOf', () => {
  it('RN-5: de un error solo deja el nombre de su clase, nunca el mensaje', () => {
    const error = new QuotaProbeError('informe-secreto.docx');

    expect(errorClassOf(error)).toBe('QuotaProbeError');
    expect(errorClassOf(new TypeError('dato'))).toBe('TypeError');
  });

  it.each<[unknown, string]>([
    ['texto con datos', 'string'],
    [42, 'number'],
    [undefined, 'undefined'],
    [null, 'object'],
  ])('RN-5: de un valor lanzado que no es `Error` (%p) deja solo su tipo', (thrown, expected) => {
    expect(errorClassOf(thrown)).toBe(expected);
  });
});
