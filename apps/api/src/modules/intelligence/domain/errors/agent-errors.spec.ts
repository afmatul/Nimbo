import { AGENT_INVALID_QUESTION_REASONS, INTELLIGENCE_ERROR_CODES } from '@nimbo/contracts';

import {
  DomainError,
  InvalidInputError,
  NotFoundError,
  TooManyRequestsError,
} from '../../../../shared/domain/errors';

import {
  AgentInvalidQuestionError,
  AgentQuotaExceededError,
  AgentScopeNotFoundError,
  AgentUnavailableError,
} from './index';

describe('errores del agente (plan 020 §2 y §4)', () => {
  it.each(AGENT_INVALID_QUESTION_REASONS)(
    'CA-6: `AgentInvalidQuestionError` es un 422 con el código del contrato y motivo `%s`',
    (reason) => {
      const error = new AgentInvalidQuestionError(reason, 1000);

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(error.status).toBe(422);
      expect(error.code).toBe(INTELLIGENCE_ERROR_CODES.AGENT_INVALID_QUESTION);
      expect(error.details).toEqual({ reason });
    },
  );

  it('CA-17: `AgentScopeNotFoundError` es un 404 sin datos del ámbito pedido', () => {
    const error = new AgentScopeNotFoundError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.code).toBe(INTELLIGENCE_ERROR_CODES.AGENT_SCOPE_NOT_FOUND);
    expect(error.details).toBeUndefined();
  });

  it('CA-11: `AgentQuotaExceededError` es un 429 con el mensaje de la spec, `limit` y `resetsAt`', () => {
    const resetsAt = new Date('2026-11-01T06:00:00.000Z');
    const error = new AgentQuotaExceededError(20, resetsAt);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).not.toBeInstanceOf(TooManyRequestsError);
    expect(error.status).toBe(429);
    expect(error.code).toBe(INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED);
    expect(error.message).toBe(
      'Usaste tus 20 consultas de este mes. Se renuevan el 1 de noviembre de 2026.',
    );
    expect(error.details).toEqual({ limit: 20, resetsAt: '2026-11-01T06:00:00.000Z' });
  });

  it('CA-11, P-9: sin fecha de renovación (solo lectura) `details` no lleva `resetsAt` y el mensaje dice cómo renovar', () => {
    const error = new AgentQuotaExceededError(500, null);

    expect(error.message).toBe(
      'Usaste tus 500 consultas de este mes. Se renuevan cuando renueves tu plan.',
    );
    expect(error.details).toEqual({ limit: 500 });
  });

  it('CA-15: `AgentUnavailableError` es un 503 que dice que los archivos siguen a salvo', () => {
    const error = new AgentUnavailableError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.status).toBe(503);
    expect(error.code).toBe(INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE);
    expect(error.message).toContain('El agente no está disponible. Tus archivos siguen a salvo.');
  });
});
