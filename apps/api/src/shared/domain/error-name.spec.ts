import { errorName } from './error-name';

describe('errorName (PD-63)', () => {
  it('de un `Error` devuelve solo su nombre, nunca el mensaje', () => {
    expect(errorName(new TypeError('clave u/123/abc'))).toBe('TypeError');
  });

  it('de cualquier otra cosa lanzada, `unknown`', () => {
    expect(errorName('texto')).toBe('unknown');
    expect(errorName(undefined)).toBe('unknown');
  });
});
