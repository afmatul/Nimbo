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
