import {
  AGENT_ANSWER_OUTCOMES,
  AGENT_INVALID_QUESTION_REASONS,
  AGENT_SCOPE_TYPES,
  INTELLIGENCE_ERROR_CODES,
  agentAskRequestSchema,
  agentEventSchema,
  agentInvalidQuestionDetailsSchema,
  agentQuotaExceededDetailsSchema,
  agentStatusSchema,
} from './index';

const FILE_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const VERSION_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const AT = '2026-11-01T06:00:00.000Z';

const STATUS = { used: 3, limit: 20, resetsAt: AT, hasIndexedFiles: true, maxQuestionChars: 1000 };
const CITATION = {
  type: 'citation',
  ordinal: 1,
  fileId: FILE_ID,
  versionId: VERSION_ID,
  fileName: 'informe.docx',
  label: 'Sección «Alcance», párrafos 2–3',
  isCertain: true,
};

describe('contratos del agente (plan 020 §4)', () => {
  it('CA-6, CA-7, CA-11, CA-15, CA-17: los cuatro códigos del agente están en `INTELLIGENCE_ERROR_CODES`', () => {
    expect(INTELLIGENCE_ERROR_CODES).toMatchObject({
      AGENT_INVALID_QUESTION: 'AGENT_INVALID_QUESTION',
      AGENT_SCOPE_NOT_FOUND: 'AGENT_SCOPE_NOT_FOUND',
      AGENT_QUOTA_EXCEEDED: 'AGENT_QUOTA_EXCEEDED',
      AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
    });
  });

  it('RN-9: el ámbito es una carpeta o un archivo; sin ámbito, todos los accesibles', () => {
    expect(AGENT_SCOPE_TYPES).toEqual(['folder', 'file']);
    expect(agentAskRequestSchema.parse({ question: '¿Qué dice?' })).toEqual({
      question: '¿Qué dice?',
    });
    const scoped = { question: '¿Qué dice?', scope: { type: 'folder', id: FILE_ID } };
    expect(agentAskRequestSchema.parse(scoped)).toEqual(scoped);
  });

  it('CA-6: la petición acepta una pregunta vacía o larga para que el dominio responda 422 con motivo', () => {
    expect(agentAskRequestSchema.safeParse({ question: '' }).success).toBe(true);
    expect(agentAskRequestSchema.safeParse({ question: 'a'.repeat(5000) }).success).toBe(true);
  });

  it.each([
    ['sin pregunta', {}],
    ['pregunta que no es texto', { question: 42 }],
    ['ámbito `all` explícito', { question: 'q', scope: { type: 'all', id: FILE_ID } }],
    ['ámbito sin id', { question: 'q', scope: { type: 'file' } }],
    ['id que no es uuid', { question: 'q', scope: { type: 'file', id: 'informe.docx' } }],
    ['campo de historial', { question: 'q', conversationId: FILE_ID }],
  ])('RN-9, RN-10: rechaza una petición con %s', (_case, body) => {
    expect(agentAskRequestSchema.safeParse(body).success).toBe(false);
  });

  it('CA-6: el motivo del 422 es `empty` o `too_long`', () => {
    expect(AGENT_INVALID_QUESTION_REASONS).toEqual(['empty', 'too_long']);
    expect(agentInvalidQuestionDetailsSchema.parse({ reason: 'too_long' })).toEqual({
      reason: 'too_long',
    });
    expect(agentInvalidQuestionDetailsSchema.safeParse({ reason: 'hostil' }).success).toBe(false);
  });

  it('CA-11: el 429 trae `limit` y `resetsAt`; sin fecha de renovación (solo lectura) `resetsAt` falta', () => {
    expect(agentQuotaExceededDetailsSchema.parse({ limit: 20, resetsAt: AT })).toEqual({
      limit: 20,
      resetsAt: AT,
    });
    expect(agentQuotaExceededDetailsSchema.parse({ limit: 20 })).toEqual({ limit: 20 });
    expect(
      agentQuotaExceededDetailsSchema.safeParse({ limit: 20, resetsAt: 'mañana' }).success,
    ).toBe(false);
  });

  it('CA-7, CA-10, RN-7: el estado trae usadas, límite, renovación, indexados y máximo de la pregunta', () => {
    expect(agentStatusSchema.parse(STATUS)).toEqual(STATUS);
    expect(agentStatusSchema.parse({ ...STATUS, resetsAt: null })).toEqual({
      ...STATUS,
      resetsAt: null,
    });
  });

  it.each([
    ['usadas negativas', { ...STATUS, used: -1 }],
    ['límite fraccionario', { ...STATUS, limit: 2.5 }],
    ['máximo cero', { ...STATUS, maxQuestionChars: 0 }],
    ['sin `hasIndexedFiles`', { ...STATUS, hasIndexedFiles: undefined }],
    ['historial', { ...STATUS, history: [] }],
  ])('CA-10, RN-10: rechaza un estado con %s', (_case, status) => {
    expect(agentStatusSchema.safeParse(status).success).toBe(false);
  });

  it('CA-1, CA-4, RN-6: la cita trae ordinal, archivo, versión, nombre, etiqueta y certeza', () => {
    expect(agentEventSchema.parse(CITATION)).toEqual(CITATION);
    const uncertain = { ...CITATION, label: 'Página 4 (ubicación aproximada)', isCertain: false };
    expect(agentEventSchema.parse(uncertain)).toEqual(uncertain);
  });

  it.each([
    ['ordinal cero', { ...CITATION, ordinal: 0 }],
    ['archivo que no es uuid', { ...CITATION, fileId: 'informe.docx' }],
    ['sin versión', { ...CITATION, versionId: undefined }],
    ['texto del fragmento', { ...CITATION, text: 'contenido del archivo' }],
  ])('CA-1, CA-17: rechaza una cita con %s', (_case, event) => {
    expect(agentEventSchema.safeParse(event).success).toBe(false);
  });

  it('CA-1: `delta` lleva solo texto', () => {
    expect(agentEventSchema.parse({ type: 'delta', text: 'Según el informe' })).toEqual({
      type: 'delta',
      text: 'Según el informe',
    });
    expect(agentEventSchema.safeParse({ type: 'delta', text: '' }).success).toBe(false);
  });

  it('CA-3, RN-5: `done` cierra con `answered` o `not_found` y el contador actualizado', () => {
    expect(AGENT_ANSWER_OUTCOMES).toEqual(['answered', 'not_found']);
    const done = { type: 'done', outcome: 'not_found', used: 4, limit: 20 };
    expect(agentEventSchema.parse(done)).toEqual(done);
    expect(agentEventSchema.safeParse({ ...done, outcome: 'no_indexed' }).success).toBe(false);
  });

  it('CA-15: el `error` a mitad del flujo solo lleva `AGENT_UNAVAILABLE`', () => {
    const error = { type: 'error', code: 'AGENT_UNAVAILABLE' };
    expect(agentEventSchema.parse(error)).toEqual(error);
    expect(
      agentEventSchema.safeParse({ type: 'error', code: 'AGENT_QUOTA_EXCEEDED' }).success,
    ).toBe(false);
    expect(agentEventSchema.safeParse({ ...error, message: 'detalle interno' }).success).toBe(
      false,
    );
  });

  it('plan §4: un evento de otro tipo no pasa', () => {
    expect(agentEventSchema.safeParse({ type: 'progress', percent: 50 }).success).toBe(false);
  });
});
