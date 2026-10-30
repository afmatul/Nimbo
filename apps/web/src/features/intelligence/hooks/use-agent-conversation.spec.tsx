/**
 * @jest-environment jsdom
 */
import {
  INTELLIGENCE_ERROR_CODES,
  type AgentAskRequest,
  type AgentEvent,
  type AgentStatusResponse,
} from '@nimbo/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';

import { ApiClientError } from '../../../lib/api-error';
import type { AgentScope } from '../agent-scope';
import { agentStatus, citation, delta, DONE, FOLDER_ID } from '../test-agent';

import { useAgentConversation, type AgentConversationDeps } from './use-agent-conversation';

const QUESTION = '¿Cuál es el plazo de entrega?';
const FOLDER: AgentScope = { type: 'folder', id: FOLDER_ID, name: 'Finanzas' };

type Ask = jest.Mock<AsyncIterable<AgentEvent>, [AgentAskRequest, AbortSignal]>;

/** Entrega los eventos y, si `hang`, espera a «Detener» como un modelo que sigue escribiendo. */
function streamOf(events: readonly AgentEvent[], hang = false) {
  return async function* (_request: AgentAskRequest, signal: AbortSignal) {
    yield* events;
    if (hang && !signal.aborted) {
      await new Promise((resolve) => signal.addEventListener('abort', resolve));
    }
  };
}

/** Falla antes del primer evento, como `streamAnswer` ante un no-2xx. */
function rejecting(error: unknown) {
  return (): AsyncIterable<AgentEvent> => ({
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
  });
}

function apiError(code: string, details: Record<string, string | number> = {}): ApiClientError {
  return new ApiClientError({ code, message: code, correlationId: 'corr-1', details });
}

function setup(status: AgentStatusResponse = agentStatus()) {
  const loadStatus = jest.fn<Promise<AgentStatusResponse>, []>().mockResolvedValue(status);
  const ask: Ask = jest.fn();
  const deps: AgentConversationDeps = { loadStatus, ask };
  const view = renderHook(() => useAgentConversation(deps));
  return { ...view, loadStatus, ask };
}

async function settle(): Promise<void> {
  await act(async () => undefined);
}

describe('useAgentConversation', () => {
  it('CA-3: pregunta con el ámbito vigente y acumula la respuesta', async () => {
    const { result, ask } = setup();
    ask.mockImplementation(streamOf([citation(), delta('El plazo es de 30 días [1].'), DONE]));
    act(() => result.current.setScope(FOLDER));

    let sent = false;
    act(() => {
      sent = result.current.ask(`  ${QUESTION}  `);
    });
    await settle();

    expect(sent).toBe(true);
    expect(ask.mock.calls[0]?.[0]).toEqual({
      question: QUESTION,
      scope: { type: 'folder', id: FOLDER_ID },
    });
    expect(result.current.state.turns[0]).toMatchObject({ text: 'El plazo es de 30 días [1].' });
    expect(result.current.screen).toBe('con-citas');
  });

  it('D-9: lee el estado al pedirlo y lo relee al terminar cada respuesta', async () => {
    const { result, ask, loadStatus } = setup();
    ask.mockImplementation(streamOf([delta('Texto'), DONE]));

    act(() => result.current.refreshStatus());
    await settle();
    expect(result.current.state.agentStatus).toEqual(agentStatus());

    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });

  it('CA-7: no envía la pregunta vacía ni la larga, con el máximo de la API', async () => {
    const { result, ask } = setup(agentStatus({ maxQuestionChars: 10 }));
    act(() => result.current.refreshStatus());
    await settle();

    act(() => {
      result.current.ask('   ');
    });
    expect(result.current.screen).toBe('error-pregunta-vacia');
    act(() => {
      result.current.ask('a'.repeat(14));
    });

    expect(ask).not.toHaveBeenCalled();
    expect(result.current.state.error?.details).toMatchObject({ excessChars: 4, maxChars: 10 });
    expect(result.current.screen).toBe('error-pregunta');
  });

  it('CA-4: «Detener» tras el texto aborta, conserva lo recibido y relee el contador', async () => {
    const { result, ask, loadStatus } = setup();
    ask.mockImplementation(streamOf([delta('Lo recibido')], true));
    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();

    act(() => result.current.stop());
    await settle();

    expect(ask.mock.calls[0]?.[1].aborted).toBe(true);
    expect(result.current.state.turns[0]).toMatchObject({ text: 'Lo recibido', stopped: true });
    expect(result.current.screen).toBe('detenido');
    expect(loadStatus).toHaveBeenCalledTimes(1);
  });

  it('CA-4: «Detener» antes del texto deja el turno vacío y muestra el contador del servidor', async () => {
    const { result, ask, loadStatus } = setup(agentStatus({ used: 3 }));
    ask.mockImplementation(streamOf([], true));
    act(() => {
      result.current.ask(QUESTION);
    });
    act(() => result.current.stop());
    await settle();

    expect(result.current.state.turns[0]).toMatchObject({ text: '', stopped: true });
    await waitFor(() => expect(result.current.state.agentStatus?.used).toBe(3));
    expect(loadStatus).toHaveBeenCalledTimes(1);
  });

  it('CA-8: un error previo al flujo queda por code con sus details', async () => {
    const { result, ask } = setup();
    const quota = apiError(INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED, { limit: 20 });
    ask.mockImplementation(rejecting(quota));

    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();

    expect(result.current.state.error).toEqual({
      code: INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED,
      details: { limit: 20 },
      correlationId: 'corr-1',
    });
    expect(result.current.screen).toBe('limite-alcanzado');
  });

  it('CA-7: sin el máximo leído, el 422 del servidor queda con su motivo', async () => {
    const { result, ask } = setup();
    ask.mockImplementation(
      rejecting(apiError(INTELLIGENCE_ERROR_CODES.AGENT_INVALID_QUESTION, { reason: 'too_long' })),
    );
    act(() => {
      result.current.ask('a'.repeat(5000));
    });
    await settle();

    expect(result.current.state.error?.details).toEqual({ reason: 'too_long' });
    expect(result.current.screen).toBe('error-pregunta');
  });

  it('CA-16: `AGENT_SCOPE_NOT_FOUND` restablece el ámbito y la pregunta se reenvía sin él', async () => {
    const { result, ask } = setup();
    ask
      .mockImplementationOnce(rejecting(apiError(INTELLIGENCE_ERROR_CODES.AGENT_SCOPE_NOT_FOUND)))
      .mockImplementationOnce(streamOf([delta('Texto'), DONE]));
    act(() => result.current.setScope(FOLDER));
    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();
    expect(result.current.state.scope).toEqual({ type: 'all' });

    act(() => result.current.retry());
    await settle();

    expect(ask.mock.calls[1]?.[0]).toEqual({ question: QUESTION });
    expect(result.current.state.turns).toHaveLength(1);
  });

  it('CA-9: «Reintentar» reenvía la última pregunta tras un fallo a mitad', async () => {
    const { result, ask } = setup();
    ask
      .mockImplementationOnce(
        streamOf([delta('Parcial'), { type: 'error', code: 'AGENT_UNAVAILABLE' }]),
      )
      .mockImplementationOnce(streamOf([delta('Completa'), DONE]));
    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();
    expect(result.current.screen).toBe('no-disponible-parcial');

    act(() => result.current.retry());
    await settle();

    expect(ask.mock.calls[1]?.[0]).toEqual({ question: QUESTION });
    expect(result.current.state.turns.map((turn) => turn.text)).toEqual(['Parcial', 'Completa']);
  });

  it('un fallo que no es de la API se trata como el genérico', async () => {
    const { result, ask } = setup();
    ask.mockImplementation(rejecting(new TypeError('boom')));

    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();

    expect(result.current.state.error?.code).toBe('INTERNAL_ERROR');
  });

  it('resetScope vuelve a «Todos mis archivos» (CA-14)', () => {
    const { result } = setup();
    act(() => result.current.setScope(FOLDER));
    act(() => result.current.resetScope());

    expect(result.current.state.scope).toEqual({ type: 'all' });
  });

  it('CA-17: nada de la sesión se guarda en localStorage ni sessionStorage', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const { result, ask } = setup();
    ask.mockImplementation(streamOf([citation(), delta('Respuesta [1]'), DONE]));
    act(() => result.current.refreshStatus());
    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();

    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it('desmontar aborta la respuesta en curso', async () => {
    const { result, ask, unmount } = setup();
    ask.mockImplementation(streamOf([], true));
    act(() => {
      result.current.ask(QUESTION);
    });
    await settle();

    unmount();

    expect(ask.mock.calls[0]?.[1].aborted).toBe(true);
  });
});
