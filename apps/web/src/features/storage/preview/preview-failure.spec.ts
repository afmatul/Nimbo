import { STORAGE_PREVIEW_FAILURE_CODES } from '@nimbo/contracts';

import { ApiClientError } from '../../../lib/api-error';

import { classifyPreviewFailure } from './preview-failure';

const apiError = (code: string, status?: number) =>
  new ApiClientError({
    code,
    status,
    message: 'PRIVATE_MESSAGE',
    correlationId: 'request-17',
    retryAfterSeconds: 17,
  });

describe('clasificación estructural T-06', () => {
  it.each([
    ['STORAGE_NODE_NOT_FOUND', 404, 'not-found'],
    ['STORAGE_PREVIEW_UNSUPPORTED', 422, 'unsupported'],
    ['STORAGE_TOO_MANY_REQUESTS', 429, 'rate-limited'],
    ['SHARED_FORBIDDEN', 403, 'forbidden'],
    ['SHARED_UNAUTHENTICATED', 401, 'unauthenticated'],
  ] as const)('CA-2: clasifica %s sin copiar el mensaje del servidor', (code, status, reason) => {
    expect(classifyPreviewFailure(apiError(code, status))).toMatchObject({
      reason,
      correlationId: 'request-17',
      retryAfterSeconds: 17,
    });
  });

  it('CA-2: distingue red, error operativo y no supone que un RangeError sea memoria', () => {
    expect(classifyPreviewFailure(apiError('INTERNAL_ERROR')).reason).toBe('network');
    expect(classifyPreviewFailure(apiError('INTERNAL_ERROR', 500)).reason).toBe('unexpected');
    expect(classifyPreviewFailure(new RangeError('PRIVATE_MESSAGE')).reason).toBe('unexpected');
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'Guardia transversal: el código desconocido %s no introduce una razón heredada',
    (code) => {
      expect(classifyPreviewFailure(apiError(code, 500)).reason).toBe('unexpected');
    },
  );

  it.each(Object.values(STORAGE_PREVIEW_FAILURE_CODES))(
    'CA-2: %s no es un error HTTP del POST',
    (code) => {
      expect(classifyPreviewFailure(apiError(code, 500)).reason).toBe('unexpected');
    },
  );

  it('Guardia transversal: descarta URL, stack, cause, token, key y correlación privada', () => {
    const url = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
    const error = new ApiClientError({
      code: 'INTERNAL_ERROR',
      status: 500,
      message: url,
      correlationId: url,
    });
    Object.assign(error, {
      token: 'PRIVATE_TOKEN',
      objectKey: 'PRIVATE_KEY',
      cause: new Error(url),
    });
    error.stack = 'PRIVATE_STACK';
    const serialized = JSON.stringify(classifyPreviewFailure(error));
    for (const secret of [url, 'PRIVATE_', 'X-Amz-Signature', 'private-object'])
      expect(serialized.includes(secret)).toBe(false);
  });
});
