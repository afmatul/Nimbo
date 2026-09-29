import { assertIdempotencyKey } from './i-mailer.port';

const TOKEN_ID = '5f0c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

describe('assertIdempotencyKey', () => {
  it.each([`identity.verification.${TOKEN_ID}`, `identity.attempt-notice.${TOKEN_ID}`, 'a_b-c.1'])(
    'CA-21: acepta la clave `%s` (formato `<tag>.<id>`)',
    (key) => {
      expect(() => {
        assertIdempotencyKey(key);
      }).not.toThrow();
    },
  );

  it.each([
    ['con `:` (BullMQ la rechaza como `jobId`)', `identity:verification:${TOKEN_ID}`],
    ['con espacios', `identity.verification. ${TOKEN_ID}`],
    ['vacía', ''],
    ['con `/`', `identity/verification/${TOKEN_ID}`],
    ['con `@`', 'identity.verification.ana@ejemplo.com'],
    ['con caracteres no ASCII', 'identity.verificación.1'],
  ])('CA-21: rechaza una clave %s', (_caso, key) => {
    expect(() => {
      assertIdempotencyKey(key);
    }).toThrow(/idempotencyKey/);
  });
});
