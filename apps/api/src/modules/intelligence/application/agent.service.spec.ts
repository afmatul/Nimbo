import { FakeLanguageModel } from '../../../../test/support/fake-language-model';
import {
  FakeRateLimiter,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, RateLimitExceededError, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type {
  AgentQuotaReservation,
  AgentQuotaReserveResult,
  AgentQuotaStatus,
  IAgentQuota,
} from '../../billing';
import type { AgentScope } from '../domain/agent-scope';
import {
  AgentInvalidQuestionError,
  AgentQuotaExceededError,
  AgentScopeNotFoundError,
  AgentUnavailableError,
} from '../domain/errors';
import { PdfLocation } from '../domain/pdf-location';
import { AGENT_NOT_FOUND_ANSWER } from '../domain/prompt-builder';
import type { RetrievedFragment } from '../domain/retrieved-fragment';

import { AGENT_ASK_RATE_RULE, AGENT_RATE_KEY_PREFIX, AgentAdmission } from './agent-admission';
import { AgentService } from './agent.service';
import type { AskRequest } from './agent.service';
import { AnswerComposer } from './answer-composer';
import type { AgentAnswerEvent } from './answer-composer';
import type { Retrieval, RetrievalRequest } from './hybrid-retriever';
import type { IChunkSearch } from './ports/i-chunk-search.port';

const ANA: Actor = createActor('ana', Role.CLIENT);
const QUESTION = '¿Cuál es el plazo de entrega del contrato?';
const MAX_QUESTION_CHARS = 50;
const PERIOD_START = new Date('2026-10-01T06:00:00.000Z');
const RESETS_AT = new Date('2026-11-01T06:00:00.000Z');
const RESERVATION: AgentQuotaReservation = { periodStartsAt: PERIOD_START };
const ALL: AgentScope = { type: 'all' };

const FRAGMENT: RetrievedFragment = {
  id: 'fragmento-1',
  fileId: 'archivo-1',
  versionId: 'version-1',
  fileName: 'contrato.pdf',
  text: 'El plazo de entrega es de 30 días.',
  location: PdfLocation.page(2),
};

/** `IAgentQuota` en memoria: concede o agota según `exhausted` y anota reservas y liberaciones. */
class FakeAgentQuota implements IAgentQuota {
  exhausted = false;
  used = 3;
  readonly released: AgentQuotaReservation[] = [];

  constructor(private readonly journal: Journal) {}

  reserve(): Promise<AgentQuotaReserveResult> {
    this.journal.add('quota:reserve');
    if (this.exhausted) {
      return Promise.resolve({ outcome: 'exhausted', limit: 20, resetsAt: RESETS_AT });
    }
    this.used += 1;
    const status = { used: this.used, limit: 20, resetsAt: RESETS_AT };
    return Promise.resolve({ outcome: 'granted', reservation: RESERVATION, ...status });
  }

  release(_actor: Actor, reservation: AgentQuotaReservation): Promise<void> {
    this.journal.add('quota:release');
    this.released.push(reservation);
    return Promise.resolve();
  }

  status(): Promise<AgentQuotaStatus> {
    return Promise.resolve({ used: this.used, limit: 20, resetsAt: RESETS_AT });
  }
}

/** Ámbito e indexados fijos para la admisión; la búsqueda la hace el recuperador doble. */
class AdmissionChunkSearch implements Pick<IChunkSearch, 'hasIndexed' | 'scopeExists'> {
  indexed = true;
  scopeFound = true;

  hasIndexed(): Promise<boolean> {
    return Promise.resolve(this.indexed);
  }

  scopeExists(): Promise<boolean> {
    return Promise.resolve(this.scopeFound);
  }
}

/** Recuperador doble: tarda `latencyMs` en el reloj, devuelve `retrieval` o falla con `failure`, y anota la llamada. */
class FakeRetriever {
  retrieval: Retrieval = { fragments: [FRAGMENT], discarded: 1 };
  failure: Error | null = null;
  latencyMs = 0;

  constructor(
    private readonly journal: Journal,
    private readonly clock: FixedClock,
  ) {}

  retrieve(_actor: Actor, _request: RetrievalRequest): Promise<Retrieval> {
    this.journal.add('retrieve');
    this.clock.advance(this.latencyMs);
    return this.failure === null ? Promise.resolve(this.retrieval) : Promise.reject(this.failure);
  }
}

function setup(model = new FakeLanguageModel(['El plazo es de 30 días [1].'])) {
  const journal = new Journal();
  const rateLimiter = new FakeRateLimiter(journal);
  const search = new AdmissionChunkSearch();
  const quota = new FakeAgentQuota(journal);
  const clock = new FixedClock(new Date('2026-10-25T15:00:00.000Z'));
  const retriever = new FakeRetriever(journal, clock);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const config = { maxQuestionChars: MAX_QUESTION_CHARS };
  const transactions = new FakeTransactionRunner(journal);
  const admission = new AgentAdmission(rateLimiter, search, transactions, config);
  const composer = new AnswerComposer(model);
  const service = new AgentService(admission, quota, retriever, composer, clock, logger, config);
  return { journal, rateLimiter, search, quota, retriever, clock, logger, model, service };
}

const request = (overrides: Partial<AskRequest> = {}): AskRequest => ({
  question: QUESTION,
  scope: ALL,
  signal: new AbortController().signal,
  ...overrides,
});

async function collect(service: AgentService, ask: AskRequest): Promise<AgentAnswerEvent[]> {
  const events: AgentAnswerEvent[] = [];
  for await (const event of service.ask(ANA, ask)) events.push(event);
  return events;
}

/** La única línea `agent.asked` registrada (CA-18). */
function askedLog(logger: ReturnType<typeof setup>['logger']): Record<string, unknown> {
  const calls = [...logger.info.mock.calls, ...logger.warn.mock.calls] as [
    Record<string, unknown>,
  ][];
  const asked = calls.map(([entry]) => entry).filter((entry) => entry.event === 'agent.asked');
  expect(asked).toHaveLength(1);
  return asked[0] ?? {};
}

describe('AgentService.ask (plan 020 §2, fila 3)', () => {
  it('CA-1: admite, reserva, recupera y compone; cierra con el uso de la reserva y no libera', async () => {
    const { service, quota, journal, model } = setup();

    const events = await collect(service, request());

    expect(events.at(-1)).toEqual({ type: 'done', outcome: 'answered', used: 4, limit: 20 });
    expect(events.some((event) => event.type === 'citation' && event.fileId === 'archivo-1')).toBe(
      true,
    );
    expect(journal.indexOf('rate:consume')).toBeLessThan(journal.indexOf('quota:reserve'));
    expect(journal.indexOf('quota:reserve')).toBeLessThan(journal.indexOf('retrieve'));
    expect(quota.released).toHaveLength(0);
    expect(model.prompts).toHaveLength(1);
  });

  it('CA-1: el límite de tasa es por cuenta y con la regla constante', async () => {
    const { service, rateLimiter } = setup();

    await collect(service, request());

    expect(rateLimiter.calls).toEqual([
      { key: `${AGENT_RATE_KEY_PREFIX}${ANA.id}`, rules: [AGENT_ASK_RATE_RULE] },
    ]);
  });

  it('CA-6: una pregunta vacía o demasiado larga es 422 y no reserva consulta', async () => {
    const { service, journal, logger } = setup();

    await expect(collect(service, request({ question: '   ' }))).rejects.toMatchObject({
      details: { reason: 'empty' },
    });
    await expect(
      collect(service, request({ question: 'x'.repeat(MAX_QUESTION_CHARS + 1) })),
    ).rejects.toBeInstanceOf(AgentInvalidQuestionError);

    expect(journal.entries).not.toContain('quota:reserve');
    expect(logger.info.mock.calls.map(([entry]) => (entry as { outcome: string }).outcome)).toEqual(
      ['invalid', 'invalid'],
    );
  });

  it('CA-17: un ámbito ajeno o inexistente es 404 y no reserva consulta', async () => {
    const { service, search, journal } = setup();
    search.scopeFound = false;

    const ask = request({ scope: { type: 'folder', id: 'carpeta-de-otra-cuenta' } });

    await expect(collect(service, ask)).rejects.toBeInstanceOf(AgentScopeNotFoundError);
    expect(journal.entries).not.toContain('quota:reserve');
  });

  it('plan §5: limitada por tasa responde 429 antes de validar y no reserva consulta', async () => {
    const { service, rateLimiter, journal, logger } = setup();
    rateLimiter.decision = { allowed: false, retryAfterSeconds: 30 };

    await expect(collect(service, request({ question: '' }))).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(journal.entries).not.toContain('quota:reserve');
    expect(askedLog(logger)).toMatchObject({ outcome: 'rate_limited' });
  });

  it('CA-7: sin archivos indexados responde la frase fija sin modelo, sin recuperar y sin reservar', async () => {
    const { service, search, journal, model, logger } = setup();
    search.indexed = false;

    const events = await collect(service, request());

    expect(events).toEqual([
      { type: 'delta', text: AGENT_NOT_FOUND_ANSWER },
      { type: 'done', outcome: 'not_found', used: 3, limit: 20 },
    ]);
    expect(journal.entries).not.toContain('quota:reserve');
    expect(journal.entries).not.toContain('retrieve');
    expect(model.prompts).toHaveLength(0);
    expect(askedLog(logger)).toMatchObject({ outcome: 'no_indexed', fragmentCount: 0 });
  });

  it('CA-3: indexado pero sin fragmentos responde la frase fija y la consulta cuenta (RN-5)', async () => {
    const { service, retriever, quota, model, logger } = setup();
    retriever.retrieval = { fragments: [], discarded: 0 };

    const events = await collect(service, request());

    expect(events.at(-1)).toEqual({ type: 'done', outcome: 'not_found', used: 4, limit: 20 });
    expect(model.prompts).toHaveLength(0);
    expect(quota.released).toHaveLength(0);
    expect(askedLog(logger)).toMatchObject({ outcome: 'not_found' });
  });

  it('CA-11: con las consultas agotadas responde 429 con límite y renovación y no libera', async () => {
    const { service, quota, journal, logger } = setup();
    quota.exhausted = true;

    const failure = collect(service, request());

    await expect(failure).rejects.toBeInstanceOf(AgentQuotaExceededError);
    await expect(failure).rejects.toMatchObject({
      details: { limit: 20, resetsAt: RESETS_AT.toISOString() },
    });
    expect(journal.entries).not.toContain('retrieve');
    expect(quota.released).toHaveLength(0);
    expect(askedLog(logger)).toMatchObject({ outcome: 'quota' });
  });

  it('CA-15: si la recuperación no puede vectorizar la pregunta, libera la consulta reservada', async () => {
    const { service, retriever, quota, logger } = setup();
    retriever.failure = new AgentUnavailableError();

    await expect(collect(service, request())).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(quota.released).toEqual([RESERVATION]);
    expect(askedLog(logger)).toMatchObject({ outcome: 'unavailable' });
  });

  it('CA-15: si el modelo falla antes del primer trozo, libera la consulta', async () => {
    const { service, quota } = setup(new FakeLanguageModel(['Dato [1].'], { failAfter: 0 }));

    await expect(collect(service, request())).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(quota.released).toEqual([RESERVATION]);
  });

  it('CA-15: si el modelo falla a mitad del flujo, lo ya enviado llega y la consulta se libera', async () => {
    const model = new FakeLanguageModel(['Dato [1]', ' y más.'], { failAfter: 1 });
    const { service, quota } = setup(model);
    const events: AgentAnswerEvent[] = [];

    const run = async (): Promise<void> => {
      for await (const event of service.ask(ANA, request())) events.push(event);
    };

    await expect(run()).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(events.map((event) => event.type)).toEqual(['citation', 'delta']);
    expect(quota.released).toEqual([RESERVATION]);
  });

  it('P-9: cancelar antes del primer fragmento libera la consulta', async () => {
    const { service, quota, logger } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(collect(service, request({ signal: controller.signal }))).rejects.toBeDefined();
    expect(quota.released).toEqual([RESERVATION]);
    expect(askedLog(logger)).toMatchObject({ outcome: 'cancelled' });
  });

  it('P-9: cancelar después del primer fragmento no libera: la consulta cuenta', async () => {
    const { service, quota } = setup(new FakeLanguageModel(['Dato [1]', ' y más', ' aún.']));
    const controller = new AbortController();

    const run = async (): Promise<void> => {
      for await (const event of service.ask(ANA, request({ signal: controller.signal }))) {
        if (event.type === 'delta') controller.abort();
      }
    };

    await expect(run()).rejects.toBeDefined();
    expect(quota.released).toHaveLength(0);
  });

  it('P-9: si quien consume deja de leer tras el primer fragmento, la consulta cuenta', async () => {
    const { service, quota } = setup(new FakeLanguageModel(['Dato [1]', ' y más.']));

    for await (const event of service.ask(ANA, request())) {
      if (event.type === 'delta') break;
    }

    expect(quota.released).toHaveLength(0);
  });

  it('CA-18: registra `agent.asked` con duración, fragmentos, descartados y resultado, sin texto ni nombres', async () => {
    const { service, retriever, logger } = setup();
    retriever.latencyMs = 1200;

    await collect(service, request());

    const entry = askedLog(logger);
    expect(Object.keys(entry).sort()).toEqual(
      ['discarded', 'durationMs', 'event', 'fragmentCount', 'outcome'].sort(),
    );
    expect(entry).toMatchObject({ outcome: 'answered', fragmentCount: 1, discarded: 1 });
    expect(entry.durationMs).toBe(1200);
    const logged = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(logged).not.toContain(QUESTION);
    expect(logged).not.toContain(FRAGMENT.text);
    expect(logged).not.toContain('30 días');
  });
});

describe('AgentService.status (CA-7, CA-10)', () => {
  it('CA-10: devuelve el uso del periodo, los indexados y el máximo de la pregunta', async () => {
    const { service } = setup();

    await expect(service.status(ANA)).resolves.toEqual({
      used: 3,
      limit: 20,
      resetsAt: RESETS_AT,
      hasIndexedFiles: true,
      maxQuestionChars: MAX_QUESTION_CHARS,
    });
  });

  it('CA-7: sin versiones vigentes indexadas, `hasIndexedFiles` es falso', async () => {
    const { service, search } = setup();
    search.indexed = false;

    await expect(service.status(ANA)).resolves.toMatchObject({ hasIndexedFiles: false });
  });
});
