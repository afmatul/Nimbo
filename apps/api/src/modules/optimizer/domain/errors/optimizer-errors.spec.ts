import { OPTIMIZER_ERROR_CODES } from '@nimbo/contracts';

import { DomainError } from '../../../../shared/domain/errors';

import { EstimateStaleError, UnreadableImageError, UnsupportedTypeError } from '.';

describe('errores del optimizador (plan 021 §4)', () => {
  it('T-04: una estimación no vigente es 409 con el código del contrato', () => {
    const error = new EstimateStaleError();
    expect(error.status).toBe(409);
    expect(error.code).toBe(OPTIMIZER_ERROR_CODES.OPTIMIZER_ESTIMATE_STALE);
  });
  it('CA-3, CA-4: `UnsupportedTypeError` es un 422 con el código del contrato y no nombra el archivo', () => {
    const error = new UnsupportedTypeError();

    expect(error.status).toBe(422);
    expect(error.code).toBe(OPTIMIZER_ERROR_CODES.OPTIMIZER_UNSUPPORTED_TYPE);
    expect(error.message).toBe('Solo se pueden optimizar imágenes JPEG y PNG.');
  });

  it('CA-5: `UnreadableImageError` es interno del `worker` (no llega a HTTP) y no guarda el mensaje de `sharp`', () => {
    const cause = new Error('VipsJpeg: premature end of JPEG image');
    const error = new UnreadableImageError(cause);

    expect(error).not.toBeInstanceOf(DomainError);
    expect(error.name).toBe('UnreadableImageError');
    expect(error.message).not.toContain('Vips');
    expect(error.cause).toBe(cause);
  });
});
