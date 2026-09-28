import { IDENTITY_ERROR_CODES, IDENTITY_FIELD_MESSAGES } from '@nimbo/contracts';

import { IDENTITY_FIELD_MESSAGES as reexported, messageForCode, messageForReason } from './error-catalog';

describe('error-catalog', () => {
  it('reexporta IDENTITY_FIELD_MESSAGES y resuelve cada reason', () => {
    expect(reexported).toBe(IDENTITY_FIELD_MESSAGES);
    expect(messageForReason('REQUIRED')).toBe(IDENTITY_FIELD_MESSAGES.REQUIRED);
    expect(messageForReason('PASSWORD_TOO_SHORT')).toBe('12 caracteres o más');
  });

  it('resuelve cada code de identity', () => {
    expect(messageForCode(IDENTITY_ERROR_CODES.INVALID_INPUT)).toContain('campos marcados');
    expect(messageForCode(IDENTITY_ERROR_CODES.WEAK_PASSWORD)).toContain('requisitos');
    expect(messageForCode(IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED)).toContain('venció');
    expect(messageForCode(IDENTITY_ERROR_CODES.VERIFICATION_LINK_INVALID)).toContain('no es válido');
    expect(messageForCode(IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 120 })).toContain(
      '2 minutos',
    );
  });

  it('un código desconocido cae en el genérico de 000 §10', () => {
    expect(messageForCode('NO_EXISTE', { correlationId: 'abc' })).toBe(
      'Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: abc',
    );
    expect(messageForReason('OTRO', 'abc')).toContain('abc');
  });
});
