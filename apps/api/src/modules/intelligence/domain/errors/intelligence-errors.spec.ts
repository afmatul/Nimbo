import { INTELLIGENCE_ERROR_CODES } from '@nimbo/contracts';

import { ConflictError, DomainError } from '../../../../shared/domain/errors';

import { EmbeddingUnavailableError, IndexingNotRetryableError, NotIndexableError } from './index';

describe('errores de `intelligence` (plan 019 §2 y §4)', () => {
  it('CA-13: `IndexingNotRetryableError` es un 409 con el código del contrato y pide actualizar', () => {
    const error = new IndexingNotRetryableError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe(INTELLIGENCE_ERROR_CODES.INTELLIGENCE_INDEXING_NOT_RETRYABLE);
    expect(error.message).toMatch(/Actualiza la página/);
  });

  it('CA-4: `NotIndexableError` lleva el motivo y no es un error HTTP', () => {
    const error = new NotIndexableError('sin_texto');

    expect(error.reason).toBe('sin_texto');
    expect(error.name).toBe('NotIndexableError');
    expect(error).not.toBeInstanceOf(DomainError);
  });

  it('CA-12: `EmbeddingUnavailableError` es transitorio por defecto y no reintentable sin clave', () => {
    const transient = new EmbeddingUnavailableError();
    const missingKey = new EmbeddingUnavailableError({ retryable: false });

    expect(transient.reason).toBe('proveedor_no_disponible');
    expect(transient.retryable).toBe(true);
    expect(missingKey.retryable).toBe(false);
    expect(transient).not.toBeInstanceOf(DomainError);
  });
});
