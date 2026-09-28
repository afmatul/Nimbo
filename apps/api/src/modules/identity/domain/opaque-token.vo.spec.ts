import { OpaqueToken } from './opaque-token.vo';

const BASE64URL = /^[A-Za-z0-9_-]{43}$/;

describe('OpaqueToken', () => {
  it('CA-17: genera 43 caracteres base64url sin relleno', () => {
    expect(OpaqueToken.generate().toString()).toMatch(BASE64URL);
  });

  it('CA-17: genera mil valores distintos', () => {
    const values = new Set(Array.from({ length: 1000 }, () => OpaqueToken.generate().toString()));
    expect(values.size).toBe(1000);
  });

  it('CA-17: resume el valor con SHA-256 en hexadecimal de 64 caracteres', () => {
    const hash = OpaqueToken.hashOf('secreto');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(OpaqueToken.hashOf('secreto')).toBe(hash);
    expect(OpaqueToken.hashOf('otro')).not.toBe(hash);
  });

  it.each([
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa+',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ',
  ])('CA-11: rechaza un valor mal formado: %j', (value) => {
    expect(OpaqueToken.isWellFormed(value)).toBe(false);
  });

  it('CA-11: acepta un valor de 43 caracteres base64url', () => {
    const value = OpaqueToken.generate().toString();
    expect(OpaqueToken.isWellFormed(value)).toBe(true);
  });

  it('CA-11: compara el hash en tiempo constante', () => {
    const value = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hash = OpaqueToken.hashOf(value);

    expect(OpaqueToken.matchesHash(value, hash)).toBe(true);
    expect(OpaqueToken.matchesHash(value, 'b'.repeat(64))).toBe(false);
    expect(OpaqueToken.matchesHash(value, 'corto')).toBe(false);
  });
});
