'use client';

import type { AgentAskRequest, AgentEvent, AgentStatusResponse } from '@nimbo/contracts';
import * as React from 'react';

import { toApiClientError } from '../../../lib/api-error';
import {
  conversationReducer,
  INITIAL_CONVERSATION,
  validateQuestion,
  type AgentFailure,
  type ConversationAction,
  type ConversationState,
} from '../agent-conversation';
import { ALL_FILES_SCOPE, toAskRequest, type AgentScope } from '../agent-scope';
import { agentScreen, type AgentScreen } from '../agent-screen';

/** Lo que la sesión pide a la API (`getStatus`, `streamAnswer`); inyectable para probar sin red. */
export interface AgentConversationDeps {
  readonly loadStatus: () => Promise<AgentStatusResponse>;
  readonly ask: (request: AgentAskRequest, signal: AbortSignal) => AsyncIterable<AgentEvent>;
}

export interface AgentConversation {
  readonly state: ConversationState;
  readonly screen: AgentScreen;
  /** Valida (CA-7) y envía; `false` si no se envió (vacía, larga o ya hay una respuesta en curso). */
  readonly ask: (question: string) => boolean;
  /** «Detener» (CA-4): aborta y conserva lo recibido. El servidor decide si la consulta cuenta. */
  readonly stop: () => void;
  /** «Reintentar» (CA-9, CA-16): reenvía la última pregunta con el ámbito vigente; sin preguntas, relee el estado. */
  readonly retry: () => void;
  readonly setScope: (scope: AgentScope) => void;
  readonly resetScope: () => void;
  /** Relee `GET /agent/status` (D-9): al abrir el panel; tras cada respuesta lo hace sola. */
  readonly refreshStatus: () => void;
}

type Dispatch = React.Dispatch<ConversationAction>;

function failureFrom(caught: unknown): AgentFailure {
  const { code, details, correlationId } = toApiClientError(caught);
  return { code, details, correlationId };
}

const maxCharsOf = (state: ConversationState): number | null =>
  state.agentStatus?.maxQuestionChars ?? null;

/** La respuesta en curso, fuera del render: «Detener» y desmontar la abortan sin esperar a React. */
interface InFlightAnswer {
  /** Un `AbortController` nuevo; `null` si ya hay una respuesta en curso. */
  readonly start: () => AbortController | null;
  readonly finish: (controller: AbortController) => void;
  readonly abort: () => void;
  readonly mount: () => void;
  readonly unmount: () => void;
  readonly isMounted: () => boolean;
}

function createInFlightAnswer(): InFlightAnswer {
  let current: AbortController | null = null;
  let mounted = false;
  const abort = (): void => {
    current?.abort();
    current = null;
  };
  return {
    start: () => (current === null ? (current = new AbortController()) : null),
    finish: (controller) => {
      if (current === controller) current = null;
    },
    abort,
    mount: () => {
      mounted = true;
    },
    unmount: () => {
      mounted = false;
      abort();
    },
    isMounted: () => mounted,
  };
}

function useInFlightAnswer(): InFlightAnswer {
  const [inFlight] = React.useState(createInFlightAnswer);
  React.useEffect(() => {
    inFlight.mount();
    return inFlight.unmount;
  }, [inFlight]);
  return inFlight;
}

function useStatusRefresh(loadStatus: AgentConversationDeps['loadStatus'], dispatch: Dispatch) {
  return React.useCallback(() => {
    loadStatus().then(
      (status) => dispatch({ type: 'statusLoaded', status }),
      (caught: unknown) => dispatch({ type: 'statusFailed', failure: failureFrom(caught) }),
    );
  }, [loadStatus, dispatch]);
}

/** Lector estable del último estado, para las acciones (se lee tras el render, nunca durante él). */
function useLatest<T>(value: T): () => T {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return React.useCallback(() => ref.current, []);
}

/** Lleva los eventos al reductor; tras «Detener» o desmontar, lo que llegue tarde se descarta. */
function useStreamRunner(ask: AgentConversationDeps['ask'], dispatch: Dispatch) {
  return React.useCallback(
    async (request: AgentAskRequest, signal: AbortSignal): Promise<void> => {
      try {
        for await (const event of ask(request, signal)) {
          if (signal.aborted) return;
          dispatch({ type: 'received', event });
        }
      } catch (caught) {
        if (!signal.aborted) dispatch({ type: 'failed', failure: failureFrom(caught) });
      }
    },
    [ask, dispatch],
  );
}

interface AskWiring {
  readonly ask: AgentConversationDeps['ask'];
  readonly latest: () => ConversationState;
  readonly inFlight: InFlightAnswer;
  readonly dispatch: Dispatch;
  readonly refreshStatus: () => void;
}

/** Valida, abre el turno y lee el flujo; al terminar (o detener) relee el contador si sigue montado (D-9). */
function useAskAction({ ask, latest, inFlight, dispatch, refreshStatus }: AskWiring) {
  const runStream = useStreamRunner(ask, dispatch);
  return React.useCallback(
    (question: string): boolean => {
      const rejected = validateQuestion(question, maxCharsOf(latest()));
      if (rejected !== null) dispatch({ type: 'rejected', failure: rejected });
      const controller = rejected === null ? inFlight.start() : null;
      if (controller === null) return false;
      const text = question.trim();
      dispatch({ type: 'asked', question: text });
      void runStream(toAskRequest(text, latest().scope), controller.signal).finally(() => {
        inFlight.finish(controller);
        if (inFlight.isMounted()) refreshStatus();
      });
      return true;
    },
    [inFlight, latest, dispatch, runStream, refreshStatus],
  );
}

/**
 * Sesión del agente solo en memoria (020b D-3, RN-4, CA-17): nada va a `localStorage`, `sessionStorage` ni a la URL.
 * Deriva el estado de pantalla para que el panel solo pinte.
 */
export function useAgentConversation(deps: AgentConversationDeps): AgentConversation {
  const [state, dispatch] = React.useReducer(conversationReducer, INITIAL_CONVERSATION);
  const latest = useLatest(state);
  const inFlight = useInFlightAnswer();
  const refreshStatus = useStatusRefresh(deps.loadStatus, dispatch);
  const ask = useAskAction({ ask: deps.ask, latest, inFlight, dispatch, refreshStatus });
  const stop = React.useCallback(() => {
    inFlight.abort();
    dispatch({ type: 'stopped' });
  }, [inFlight]);
  const retry = React.useCallback(() => {
    const { turns } = latest();
    const last = turns[turns.length - 1];
    if (last === undefined) refreshStatus();
    else ask(last.question);
  }, [latest, ask, refreshStatus]);
  const setScope = React.useCallback(
    (scope: AgentScope) => dispatch({ type: 'scopeChanged', scope }),
    [],
  );
  const resetScope = React.useCallback(() => setScope(ALL_FILES_SCOPE), [setScope]);
  return React.useMemo(
    () => ({
      state,
      screen: agentScreen(state),
      ask,
      stop,
      retry,
      setScope,
      resetScope,
      refreshStatus,
    }),
    [state, ask, stop, retry, setScope, resetScope, refreshStatus],
  );
}
