import { PasswordHash } from './password-hash.vo';

describe('PasswordHash', () => {
  it('no revela el PHC al serializar ni al convertir a texto', () => {
    const hash = PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$hash');

    expect(hash.toJSON()).toBe('[REDACTED]');
    expect(hash.toString()).toBe('[REDACTED]');
    expect(JSON.stringify({ passwordHash: hash })).toBe('{"passwordHash":"[REDACTED]"}');
    expect(hash.reveal()).toContain('argon2id');
  });
});
