import { SECRET_KEYS } from '../config/secret-keys';

import { REDACTED_VALUE, redactDeep } from './redact-deep';
import { REDACTED_FIELDS } from './redacted-fields';

/** Campos que 001 agrega (plan §6.7, D-18): correo, nombre completo y los del mensaje de correo. */
const IDENTITY_FIELDS = ['email', 'correo', 'fullName', 'to', 'html', 'text'] as const;

describe('REDACTED_FIELDS (001 CA-18)', () => {
  it.each(IDENTITY_FIELDS)('CA-18: `%s` sale `[REDACTED]` en cualquier nivel', (field) => {
    const redacted = redactDeep({
      [field]: 'valor',
      job: { attempts: [{ mail: { [field]: 'valor' } }] },
    });

    expect(redacted).toEqual({
      [field]: REDACTED_VALUE,
      job: { attempts: [{ mail: { [field]: REDACTED_VALUE } }] },
    });
  });

  it.each(IDENTITY_FIELDS)('CA-18: `%s` se redacta sin distinguir mayúsculas', (field) => {
    expect(redactDeep({ [field.toUpperCase()]: 'valor' })).toEqual({
      [field.toUpperCase()]: REDACTED_VALUE,
    });
  });

  it('CA-18: `nombre` sigue en la lista', () => {
    expect(REDACTED_FIELDS.has('nombre')).toBe(true);
  });

  it.each(SECRET_KEYS)('CA-18: la clave secreta `%s` sale redactada vía `SECRET_KEYS`', (key) => {
    expect(redactDeep({ [key]: 'secreto' })).toEqual({ [key]: REDACTED_VALUE });
  });

  it('CA-18: los campos permitidos de las bitácoras de correo no se redactan', () => {
    const line = {
      tag: 'identity.verification',
      recipientId: 'u-1',
      jobId: 'j-1',
      attemptsMade: 2,
    };

    expect(redactDeep(line)).toEqual(line);
  });
});
