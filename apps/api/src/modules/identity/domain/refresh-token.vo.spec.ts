import { createHash } from 'node:crypto';

import { RefreshToken } from './refresh-token.vo';

const SESSION_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const SECRET = 'a'.repeat(43);
const TOKEN_FORMAT = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('RefreshToken', () => {
  it('CA-7: `issue` da `<sid>.<secreto>` con el uuid de la sesión y 43 caracteres base64url', () => {
    const token = RefreshToken.issue(SESSION_ID);

    expect(token.value).toMatch(TOKEN_FORMAT);
    expect(token.value.startsWith(`${SESSION_ID}.`)).toBe(true);
    expect(token.sessionId).toBe(SESSION_ID);
  });

  it('CA-24: `secretHash` es el SHA-256 hex del secreto, no del valor completo', () => {
    const token = RefreshToken.issue(SESSION_ID);
    const secret = token.value.slice(SESSION_ID.length + 1);

    expect(token.secretHash).toBe(sha256Hex(secret));
  });

  it('CA-24: `toJSON` nunca expone el valor ni el secreto', () => {
    const token = RefreshToken.issue(SESSION_ID);
    const secret = token.value.slice(SESSION_ID.length + 1);

    const serialized = JSON.stringify({ token });

    expect(serialized).not.toContain(secret);
    expect(JSON.parse(serialized)).toEqual({ token: { sessionId: SESSION_ID } });
  });

  it('CA-7: dos emisiones para la misma sesión dan secretos distintos', () => {
    const first = RefreshToken.issue(SESSION_ID);
    const second = RefreshToken.issue(SESSION_ID);

    expect(first.value).not.toBe(second.value);
    expect(first.secretHash).not.toBe(second.secretHash);
  });

  it('CA-7: `parse` de un valor emitido devuelve la misma sesión y el mismo hash', () => {
    const issued = RefreshToken.issue(SESSION_ID);

    const parsed = RefreshToken.parse(issued.value);

    expect(parsed?.sessionId).toBe(SESSION_ID);
    expect(parsed?.secretHash).toBe(issued.secretHash);
    expect(parsed?.value).toBe(issued.value);
  });

  it.each([
    ['vacío', ''],
    ['sin punto', `${SESSION_ID}${SECRET}`],
    ['con dos puntos', `${SESSION_ID}.${SECRET}.${SECRET}`],
    [
      'con un punto extra dentro del secreto',
      `${SESSION_ID}.${SECRET.slice(0, 20)}.${SECRET.slice(21)}`,
    ],
    ['con un uuid inválido', `9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6.${SECRET}`],
    ['con un uuid que no es uuid', `no-es-un-uuid.${SECRET}`],
    ['con uuid vacío', `.${SECRET}`],
    ['con secreto vacío', `${SESSION_ID}.`],
    ['con un secreto de 42 caracteres', `${SESSION_ID}.${'a'.repeat(42)}`],
    ['con un secreto de 44 caracteres', `${SESSION_ID}.${'a'.repeat(44)}`],
    ['con `+` en el secreto', `${SESSION_ID}.${'a'.repeat(42)}+`],
    ['con `/` en el secreto', `${SESSION_ID}.${'a'.repeat(42)}/`],
    ['con `=` en el secreto', `${SESSION_ID}.${'a'.repeat(42)}=`],
  ])('CA-9: `parse` rechaza un valor %s', (_case, value) => {
    expect(RefreshToken.parse(value)).toBeNull();
  });
});
