import { errorResponseSchema } from './error';

describe('errorResponseSchema', () => {
  const valid = {
    code: 'SHARED_EXAMPLE_NOT_FOUND',
    message: 'No existe el recurso solicitado. Verifica el identificador.',
    correlationId: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  };

  it('CA-16: acepta `{ code, message, correlationId }`', () => {
    expect(errorResponseSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['code', 'message', 'correlationId'] as const)('CA-16: exige `%s`', (field) => {
    const { [field]: _omitted, ...incomplete } = valid;

    expect(errorResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it('CA-16: exige `code` en SCREAMING_SNAKE_CASE (RN-1)', () => {
    expect(errorResponseSchema.safeParse({ ...valid, code: 'notFound' }).success).toBe(false);
  });
});

describe('errorResponseSchema con `fields` (001)', () => {
  const base = {
    code: 'IDENTITY_INVALID_INPUT',
    message: 'Revisa los campos marcados y corrígelos para continuar.',
    correlationId: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  };
  const issue = { field: 'email', reason: 'INVALID_EMAIL', message: 'Escribe un correo válido.' };

  it('CA-6: un error sin `fields` conserva la forma de 000 CA-16', () => {
    expect(errorResponseSchema.parse(base)).toEqual(base);
  });

  it('CA-5/CA-6: acepta `fields` con `{ field, reason, message }`', () => {
    expect(errorResponseSchema.safeParse({ ...base, fields: [issue] }).success).toBe(true);
  });

  it('CA-6: `reason` exige SCREAMING_SNAKE_CASE', () => {
    const result = errorResponseSchema.safeParse({
      ...base,
      fields: [{ ...issue, reason: 'invalidEmail' }],
    });

    expect(result.success).toBe(false);
  });

  it('CA-6: cada elemento de `fields` es estricto', () => {
    const result = errorResponseSchema.safeParse({
      ...base,
      fields: [{ ...issue, extra: true }],
    });

    expect(result.success).toBe(false);
  });

  it('CA-6: el objeto sigue siendo estricto', () => {
    expect(errorResponseSchema.safeParse({ ...base, stack: 'Error: …' }).success).toBe(false);
  });
});
