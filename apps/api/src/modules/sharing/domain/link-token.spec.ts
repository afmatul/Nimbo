import { LinkToken } from './link-token';

const BASE64URL = /^[A-Za-z0-9_-]{43}$/;

describe('LinkToken (plan 013 §2)', () => {
  it('CA-4: cada enlace nace con un token distinto de 43 caracteres base64url (256 bits)', () => {
    const values = new Set(Array.from({ length: 1000 }, () => LinkToken.generate().toString()));

    expect(values.size).toBe(1000);
    values.forEach((value) => expect(value).toMatch(BASE64URL));
  });

  it('CA-4: se guarda solo su SHA-256 en hexadecimal (`token_hash` char(64), RN-3)', () => {
    const token = LinkToken.generate();

    expect(token.hash()).toMatch(/^[0-9a-f]{64}$/);
    expect(token.hash()).toBe(LinkToken.hashOf(token.toString()));
    expect(LinkToken.hashOf('otro')).not.toBe(token.hash());
  });

  it.each([
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    `${'a'.repeat(42)}+`,
    `${'a'.repeat(42)}/`,
    `${'a'.repeat(42)}=`,
    `${'a'.repeat(42)} `,
  ])('CA-11: descarta un token mal formado antes de consultar: %j', (value) => {
    expect(LinkToken.isWellFormed(value)).toBe(false);
  });

  it('CA-11: acepta un token generado', () => {
    expect(LinkToken.isWellFormed(LinkToken.generate().toString())).toBe(true);
  });
});
