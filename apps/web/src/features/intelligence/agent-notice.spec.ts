import { INTELLIGENCE_ERROR_CODES, SHARED_ERROR_CODES } from '@nimbo/contracts';

import { dayMonthLabel } from '../../lib/format-date';
import { CHANGE_PLAN_PATH, RENEW_PATH } from '../billing';

import {
  conversationReducer,
  INITIAL_CONVERSATION,
  type ConversationAction,
  type ConversationState,
} from './agent-conversation';
import { noticeFor } from './agent-notice';
import { agentScreen } from './agent-screen';
import { agentStatus, delta, failure, UNAVAILABLE_EVENT } from './test-agent';

const { AGENT_QUOTA_EXCEEDED, AGENT_SCOPE_NOT_FOUND, AGENT_UNAVAILABLE } = INTELLIGENCE_ERROR_CODES;
const RESETS_AT = '2026-11-01T06:00:00.000Z';

const stateOf = (...actions: ConversationAction[]): ConversationState =>
  actions.reduce(conversationReducer, INITIAL_CONVERSATION);

const loaded = (overrides = {}): ConversationAction => ({
  type: 'statusLoaded',
  status: agentStatus(overrides),
});
const asked: ConversationAction = { type: 'asked', question: '¿Cuál es el plazo?' };
const failed = (code: string, details = {}): ConversationAction => ({
  type: 'failed',
  failure: failure(code, details),
});

const noticeOf = (state: ConversationState) => noticeFor(state, agentScreen(state));

describe('noticeFor', () => {
  it('sin fallo no hay aviso', () => {
    expect(noticeOf(stateOf(loaded()))).toBeNull();
    expect(
      noticeOf(stateOf(loaded(), asked, { type: 'received', event: delta('Hola') })),
    ).toBeNull();
  });

  it('CA-8: cuota agotada por la API, con la fecha de renovación y «Ver planes»', () => {
    const state = stateOf(
      loaded(),
      asked,
      failed(AGENT_QUOTA_EXCEEDED, { limit: 20, resetsAt: RESETS_AT }),
    );

    expect(noticeOf(state)).toEqual({
      cause: `Usaste tus 20 consultas de este mes. Se renuevan el ${dayMonthLabel(RESETS_AT)}.`,
      fix: 'Mientras tanto, subir, descargar y buscar archivos funciona igual.',
      link: { label: 'Ver planes', href: CHANGE_PLAN_PATH },
    });
  });

  it('CA-8, RN-5: en solo lectura sin fecha, «Renovar plan» y ninguna fecha', () => {
    const state = stateOf(loaded(), asked, failed(AGENT_QUOTA_EXCEEDED, { limit: 20 }));

    expect(noticeOf(state)).toEqual({
      cause: 'Usaste tus 20 consultas de este mes.',
      fix: 'Renueva tu plan para volver a preguntar.',
      link: { label: 'Renovar plan', href: RENEW_PATH },
    });
  });

  it('CA-8: al abrir con el contador ya agotado, el mismo aviso sin haber preguntado', () => {
    const withDate = stateOf(loaded({ used: 20, limit: 20, resetsAt: RESETS_AT }));
    const readOnly = stateOf(loaded({ used: 20, limit: 20, resetsAt: null }));

    expect(noticeOf(withDate)?.cause).toBe(
      `Usaste tus 20 consultas de este mes. Se renuevan el ${dayMonthLabel(RESETS_AT)}.`,
    );
    expect(noticeOf(withDate)?.link).toEqual({ label: 'Ver planes', href: CHANGE_PLAN_PATH });
    expect(noticeOf(readOnly)?.cause).toBe('Usaste tus 20 consultas de este mes.');
    expect(noticeOf(readOnly)?.link).toEqual({ label: 'Renovar plan', href: RENEW_PATH });
  });

  it('CA-9: el modelo cae a mitad de la respuesta y avisa que lo de arriba es parcial', () => {
    const state = stateOf(
      loaded(),
      asked,
      { type: 'received', event: delta('El plazo es') },
      { type: 'received', event: UNAVAILABLE_EVENT },
    );

    expect(noticeOf(state)?.fix).toBe(
      'La respuesta se cortó; lo de arriba es lo que alcanzó a llegar. No se descontó tu consulta.',
    );
  });

  it('CA-9: el modelo no responde antes del primer texto', () => {
    const state = stateOf(loaded(), asked, failed(AGENT_UNAVAILABLE));

    expect(noticeOf(state)).toEqual({
      cause: 'El agente no está disponible. Tus archivos siguen a salvo.',
      fix: 'No se descontó tu consulta. Inténtalo de nuevo en unos minutos.',
    });
  });

  it('CA-16: el ámbito ya no está disponible', () => {
    const state = stateOf(loaded(), asked, failed(AGENT_SCOPE_NOT_FOUND));

    expect(noticeOf(state)).toEqual({
      cause: 'Esa carpeta o archivo ya no está disponible.',
      fix: 'Elige otro ámbito.',
    });
  });

  it('otro `code`: el mensaje del catálogo como corrección', () => {
    const state = stateOf(loaded(), asked, {
      type: 'failed',
      failure: { code: 'OTRO_CODIGO', details: {}, correlationId: 'corr-1' },
    });

    expect(noticeOf(state)).toEqual({
      cause: 'No pudimos responder tu pregunta.',
      fix: 'Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: corr-1',
    });
  });

  it('un `code` compartido con texto propio, como el 429 por demasiadas solicitudes', () => {
    const state = stateOf(loaded(), asked, failed(SHARED_ERROR_CODES.TOO_MANY_REQUESTS));

    expect(noticeOf(state)?.fix).toContain('Hiciste demasiados intentos.');
  });
});
