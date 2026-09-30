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

/** Campos que 005 agrega (T-41, CA-20): URLs firmadas, claves de objeto, `upload_id`, firmas y nombres. */
const STORAGE_FIELDS = [
  'url',
  'uploadUrl',
  'claveObjeto',
  'objectKey',
  'uploadId',
  'signature',
  'suggestedName',
  'name',
  'nombre',
  'fileName',
] as const;

describe('REDACTED_FIELDS (005 CA-20)', () => {
  it.each(STORAGE_FIELDS)('CA-20: `%s` sale `[REDACTED]` en cualquier nivel', (field) => {
    expect(redactDeep({ [field]: 'valor', details: { [field]: 'valor' } })).toEqual({
      [field]: REDACTED_VALUE,
      details: { [field]: REDACTED_VALUE },
    });
  });

  it('CA-20: se conservan los campos de 001 y 002', () => {
    for (const field of ['password', 'token', 'email', 'fullname']) {
      expect(REDACTED_FIELDS.has(field)).toBe(true);
    }
  });

  it('CA-20: el identificador de recurso y el tamaño de la auditoría no se redactan', () => {
    const line = {
      event: 'file.upload_completed',
      resourceId: 'r-1',
      sizeBytes: 10,
      mode: 'simple',
    };

    expect(redactDeep(line)).toEqual(line);
  });
});

describe('REDACTED_FIELDS (002 CA-25)', () => {
  it('CA-25: `currentPassword` y `newPassword` anidados salen `[REDACTED]`', () => {
    const redacted = redactDeep({
      body: { currentPassword: 'Actual-2026!', newPassword: 'Nimbo-Nueva-2026' },
      attempts: [{ newPassword: 'Nimbo-Nueva-2026' }],
    });

    expect(redacted).toEqual({
      body: { currentPassword: REDACTED_VALUE, newPassword: REDACTED_VALUE },
      attempts: [{ newPassword: REDACTED_VALUE }],
    });
  });

  it.each(['authorization', 'cookie', 'token', 'accessToken', 'refreshToken'])(
    'CA-25: `%s` sigue redactado',
    (field) => {
      expect(redactDeep({ headers: { [field]: 'valor' } })).toEqual({
        headers: { [field]: REDACTED_VALUE },
      });
    },
  );
});
