import { INTELLIGENCE_ERROR_CODES } from '@nimbo/contracts';

import {
  conversationReducer,
  INITIAL_CONVERSATION,
  isPartialTurn,
  validateQuestion,
  type AgentTurn,
  type ConversationAction,
  type ConversationState,
} from './agent-conversation';
import { ALL_FILES_SCOPE, type AgentScope } from './agent-scope';
import {
  agentStatus,
  citation,
  delta,
  DONE,
  failure,
  FOLDER_ID,
  UNAVAILABLE_EVENT,
} from './test-agent';

const QUESTION = '¿Cuál es el plazo de entrega?';
const FOLDER: AgentScope = { type: 'folder', id: FOLDER_ID, name: 'Finanzas' };

const run = (...actions: ConversationAction[]): ConversationState =>
  actions.reduce(conversationReducer, INITIAL_CONVERSATION);

function lastTurn(state: ConversationState): AgentTurn {
  const turn = state.turns[state.turns.length - 1];
  if (turn === undefined) throw new Error('Sin turnos');
  return turn;
}

describe('conversationReducer', () => {
  it('empieza sin preguntas, en reposo y con «Todos mis archivos» (CA-1)', () => {
    expect(INITIAL_CONVERSATION).toMatchObject({
      status: 'idle',
      turns: [],
      scope: ALL_FILES_SCOPE,
      error: null,
      agentStatus: null,
    });
  });

  it('CA-3: la pregunta abre un turno en curso y acumula texto y citas por ordinal', () => {
    const state = run(
      { type: 'asked', question: QUESTION },
      { type: 'received', event: citation() },
      { type: 'received', event: delta('El plazo es ') },
      { type: 'received', event: delta('de 30 días [1].') },
    );

    expect(state.status).toBe('streaming');
    expect(lastTurn(state)).toMatchObject({
      question: QUESTION,
      text: 'El plazo es de 30 días [1].',
      outcome: null,
    });
    expect(lastTurn(state).citations[1]).toEqual(citation());
  });

  it('`done` cierra el turno con su resultado y actualiza el contador visible', () => {
    const state = run(
      { type: 'statusLoaded', status: agentStatus({ used: 3 }) },
      { type: 'asked', question: QUESTION },
      { type: 'received', event: delta('Texto') },
      { type: 'received', event: DONE },
    );

    expect(state.status).toBe('idle');
    expect(lastTurn(state).outcome).toBe('answered');
    expect(state.agentStatus).toMatchObject({ used: 4, limit: 20 });
  });

  it('no muta el estado anterior (reductor inmutable)', () => {
    const before = run({ type: 'asked', question: QUESTION });
    const snapshot = structuredClone(before);

    conversationReducer(before, { type: 'received', event: delta('Hola') });

    expect(before).toEqual(snapshot);
  });

  it('CA-4: detener tras recibir texto lo conserva y marca el turno parcial', () => {
    const state = run(
      { type: 'asked', question: QUESTION },
      { type: 'received', event: delta('Lo recibido') },
      { type: 'stopped' },
    );

    expect(state.status).toBe('idle');
    expect(lastTurn(state)).toMatchObject({ text: 'Lo recibido', stopped: true });
    expect(isPartialTurn(lastTurn(state))).toBe(true);
  });

  it('CA-4: detener antes del texto no toca el contador (el servidor libera la consulta)', () => {
    const state = run(
      { type: 'statusLoaded', status: agentStatus({ used: 3 }) },
      { type: 'asked', question: QUESTION },
      { type: 'stopped' },
    );

    expect(lastTurn(state)).toMatchObject({ text: '', stopped: true });
    expect(isPartialTurn(lastTurn(state))).toBe(false);
    expect(state.agentStatus?.used).toBe(3);
  });

  it('ignora eventos que llegan cuando ya no hay respuesta en curso', () => {
    const stopped = run({ type: 'asked', question: QUESTION }, { type: 'stopped' });

    expect(conversationReducer(stopped, { type: 'received', event: delta('tarde') })).toBe(stopped);
  });

  it('CA-9: un fallo a mitad conserva lo recibido y deja el error por code', () => {
    const state = run(
      { type: 'asked', question: QUESTION },
      { type: 'received', event: delta('Lo que alcanzó') },
      { type: 'received', event: UNAVAILABLE_EVENT },
    );

    expect(state.status).toBe('idle');
    expect(lastTurn(state)).toMatchObject({
      text: 'Lo que alcanzó',
      errorCode: INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE,
    });
    expect(isPartialTurn(lastTurn(state))).toBe(true);
    expect(state.error?.code).toBe(INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE);
  });

  it('un error previo al flujo queda en el turno y como último error, con sus details', () => {
    const quota = failure(INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED, { limit: 20 });
    const state = run({ type: 'asked', question: QUESTION }, { type: 'failed', failure: quota });

    expect(state.status).toBe('idle');
    expect(lastTurn(state)).toMatchObject({
      question: QUESTION,
      errorCode: INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED,
    });
    expect(state.error).toEqual(quota);
  });

  it('CA-16: `AGENT_SCOPE_NOT_FOUND` devuelve el ámbito a «Todos mis archivos»', () => {
    const state = run(
      { type: 'scopeChanged', scope: FOLDER },
      { type: 'asked', question: QUESTION },
      { type: 'failed', failure: failure(INTELLIGENCE_ERROR_CODES.AGENT_SCOPE_NOT_FOUND) },
    );

    expect(state.scope).toEqual(ALL_FILES_SCOPE);
  });

  it('CA-14: cambiar el ámbito lo deja vigente para las preguntas siguientes', () => {
    expect(run({ type: 'scopeChanged', scope: FOLDER }).scope).toEqual(FOLDER);
  });

  it('una pregunta nueva limpia el error y reemplaza el turno fallido que no recibió nada', () => {
    const state = run(
      { type: 'asked', question: QUESTION },
      { type: 'failed', failure: failure(INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE) },
      { type: 'asked', question: QUESTION },
    );

    expect(state.error).toBeNull();
    expect(state.turns).toHaveLength(1);
    expect(lastTurn(state)).toMatchObject({ errorCode: null, stopped: false });
  });

  it('una pregunta nueva conserva el turno parcial anterior (CA-9, CA-17)', () => {
    const state = run(
      { type: 'asked', question: QUESTION },
      { type: 'received', event: delta('Parcial') },
      { type: 'received', event: UNAVAILABLE_EVENT },
      { type: 'asked', question: QUESTION },
    );

    expect(state.turns.map((turn) => turn.text)).toEqual(['Parcial', '']);
    expect(new Set(state.turns.map((turn) => turn.id)).size).toBe(2);
  });

  it('CA-7: un rechazo local deja el error sin abrir turno', () => {
    const empty = failure(INTELLIGENCE_ERROR_CODES.AGENT_INVALID_QUESTION, { reason: 'empty' });
    const state = run({ type: 'rejected', failure: empty });

    expect(state.turns).toEqual([]);
    expect(state.error).toEqual(empty);
  });

  it('el estado del agente fallido solo se recuerda si aún no había uno', () => {
    const broken = failure('INTERNAL_ERROR');

    expect(run({ type: 'statusFailed', failure: broken }).error).toEqual(broken);
    expect(
      run(
        { type: 'statusLoaded', status: agentStatus() },
        { type: 'statusFailed', failure: broken },
      ).error,
    ).toBeNull();
  });
});

describe('validateQuestion (CA-7)', () => {
  it('rechaza la pregunta vacía o solo con espacios', () => {
    expect(validateQuestion('   ', 1000)).toEqual(
      failure(INTELLIGENCE_ERROR_CODES.AGENT_INVALID_QUESTION, { reason: 'empty' }),
    );
  });

  it('rechaza la larga con los caracteres que sobran y el máximo de la API', () => {
    expect(validateQuestion('a'.repeat(1124), 1000)).toEqual(
      failure(INTELLIGENCE_ERROR_CODES.AGENT_INVALID_QUESTION, {
        reason: 'too_long',
        excessChars: 124,
        maxChars: 1000,
      }),
    );
  });

  it('acepta la que cabe, sin contar los espacios de los extremos', () => {
    expect(validateQuestion(`  ${'a'.repeat(1000)}  `, 1000)).toBeNull();
  });

  it('sin el máximo de la API solo rechaza la vacía (el servidor decide la larga)', () => {
    expect(validateQuestion('a'.repeat(5000), null)).toBeNull();
  });
});
