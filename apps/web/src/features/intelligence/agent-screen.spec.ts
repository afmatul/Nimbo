import { INTELLIGENCE_ERROR_CODES, SHARED_ERROR_CODES } from '@nimbo/contracts';

import {
  conversationReducer,
  INITIAL_CONVERSATION,
  type ConversationAction,
  type ConversationState,
} from './agent-conversation';
import { agentScreen } from './agent-screen';
import {
  agentStatus,
  citation,
  delta,
  DONE,
  failure,
  NOT_FOUND_DONE,
  UNAVAILABLE_EVENT,
} from './test-agent';

const QUESTION = '¿Cuál es el plazo?';
const { AGENT_INVALID_QUESTION, AGENT_QUOTA_EXCEEDED, AGENT_SCOPE_NOT_FOUND, AGENT_UNAVAILABLE } =
  INTELLIGENCE_ERROR_CODES;

const loaded = (status = agentStatus()): ConversationAction => ({ type: 'statusLoaded', status });
const asked: ConversationAction = { type: 'asked', question: QUESTION };

const screenOf = (...actions: ConversationAction[]) =>
  agentScreen(actions.reduce(conversationReducer, INITIAL_CONVERSATION));

const answered = (...events: ConversationAction[]): ConversationState =>
  [loaded(), asked, ...events].reduce(conversationReducer, INITIAL_CONVERSATION);

describe('agentScreen', () => {
  it('`cargando` hasta leer el estado del agente', () => {
    expect(screenOf()).toBe('cargando');
  });

  it('CA-1, CA-2: `inicio` con archivos indexados y `vacio` sin ellos', () => {
    expect(screenOf(loaded())).toBe('inicio');
    expect(screenOf(loaded(agentStatus({ hasIndexedFiles: false })))).toBe('vacio');
  });

  it('CA-3: `respondiendo` mientras llega la respuesta', () => {
    expect(screenOf(loaded(), asked, { type: 'received', event: delta('Hola') })).toBe(
      'respondiendo',
    );
  });

  it('CA-3, CA-6: `con-citas`, y `cita-incierta` si alguna cita no es certera', () => {
    const cited = { type: 'received', event: citation() } as const;
    const uncertain = {
      type: 'received',
      event: citation({ ordinal: 2, isCertain: false }),
    } as const;
    const done = { type: 'received', event: DONE } as const;

    expect(agentScreen(answered(cited, done))).toBe('con-citas');
    expect(agentScreen(answered(cited, uncertain, done))).toBe('cita-incierta');
  });

  it('CA-5: `sin-resultados` cuando el servidor no encontró nada', () => {
    expect(agentScreen(answered({ type: 'received', event: NOT_FOUND_DONE }))).toBe(
      'sin-resultados',
    );
  });

  it('CA-4: `detenido` tras «Detener», haya o no texto', () => {
    expect(agentScreen(answered({ type: 'stopped' }))).toBe('detenido');
  });

  it('CA-8: `limite-alcanzado` por el error o por el contador ya agotado', () => {
    const quota = failure(AGENT_QUOTA_EXCEEDED, { limit: 20 });

    expect(agentScreen(answered({ type: 'failed', failure: quota }))).toBe('limite-alcanzado');
    expect(screenOf(loaded(agentStatus({ used: 20, limit: 20 })))).toBe('limite-alcanzado');
  });

  it('CA-9: `no-disponible` sin texto y `no-disponible-parcial` con lo recibido', () => {
    const unavailable = failure(AGENT_UNAVAILABLE);

    expect(agentScreen(answered({ type: 'failed', failure: unavailable }))).toBe('no-disponible');
    expect(
      agentScreen(
        answered(
          { type: 'received', event: delta('Parcial') },
          { type: 'received', event: UNAVAILABLE_EVENT },
        ),
      ),
    ).toBe('no-disponible-parcial');
  });

  it('CA-7: `error-pregunta-vacia` y `error-pregunta` según el motivo', () => {
    const rejected = (reason: string): ConversationAction => ({
      type: 'rejected',
      failure: failure(AGENT_INVALID_QUESTION, { reason }),
    });

    expect(screenOf(loaded(), rejected('empty'))).toBe('error-pregunta-vacia');
    expect(screenOf(loaded(), rejected('too_long'))).toBe('error-pregunta');
  });

  it('CA-16: `ambito-no-disponible` tras `AGENT_SCOPE_NOT_FOUND`', () => {
    expect(agentScreen(answered({ type: 'failed', failure: failure(AGENT_SCOPE_NOT_FOUND) }))).toBe(
      'ambito-no-disponible',
    );
  });

  it('`error` para cualquier otro code (el catálogo pone el mensaje)', () => {
    const tooMany = failure(SHARED_ERROR_CODES.TOO_MANY_REQUESTS);

    expect(agentScreen(answered({ type: 'failed', failure: tooMany }))).toBe('error');
  });
});
