import type { z } from 'zod';

import type { AgentAnswerEvent } from '../../src/modules/intelligence/application/answer-composer';
import { AnswerComposer } from '../../src/modules/intelligence/application/answer-composer';
import {
  HybridRetriever,
  MIN_SIMILARITY,
} from '../../src/modules/intelligence/application/hybrid-retriever';
import { AgentQuestion } from '../../src/modules/intelligence/domain/agent-question';
import { AgentUnavailableError } from '../../src/modules/intelligence/domain/errors';
import { GeminiEmbeddingProvider } from '../../src/modules/intelligence/infrastructure/gemini-embedding.provider';
import { GeminiFlashModel } from '../../src/modules/intelligence/infrastructure/gemini-flash.model';
import { GEMINI_API_BASE_URL } from '../../src/modules/intelligence/infrastructure/gemini-http';
import { createActor, errorClassOf, loadDotenvFile, loadEnv, Role } from '../../src/shared';
import { apiEnvObjectSchema } from '../../src/shared/infrastructure/config/env.schema';
import { FakeTransactionRunner, Journal } from '../support/storage-fakes';

import {
  ANSWERABLE_QUESTIONS,
  buildMeasurementCorpus,
  UNANSWERABLE_QUESTIONS,
} from './agent-measure-corpus';
import {
  FIRST_FRAGMENT_BUDGET_MS,
  meetsFirstFragmentBudget,
  P95,
  percentile,
  proposeMinSimilarity,
  proposeTimeoutMs,
} from './agent-measure-stats';
import { MemoryChunkSearch } from './memory-chunk-search';

/** Lo que lee la medición del entorno del `api` (020 D-8); la clave nunca se imprime. */
const measureEnvSchema = apiEnvObjectSchema.pick({
  GEMINI_API_KEY: true,
  GEMINI_EMBEDDING_MODEL: true,
  GEMINI_CHAT_MODEL: true,
  AGENT_MAX_QUESTION_CHARS: true,
  AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS: true,
  AGENT_MODEL_IDLE_TIMEOUT_MS: true,
});
type MeasureEnv = z.infer<typeof measureEnvSchema>;

/** Plazos holgados durante la medición: se observa cuánto tarda el modelo, no se corta con los plazos vigentes. */
const MEASUREMENT_TIMEOUT_MS = 60_000;
const MEASUREMENT_USAGE = { used: 0, limit: 0 };
const MEASURER = createActor('agent-measure', Role.CLIENT);
const MISSING_KEY_MESSAGE =
  'Falta GEMINI_API_KEY: agrégala a .env (o al entorno) y vuelve a correr la medición; usa Gemini real (020 T-09).';

/** Piezas reales del agente sobre el corpus en memoria. */
interface Pipeline {
  readonly retriever: HybridRetriever;
  readonly composer: AnswerComposer;
  readonly search: MemoryChunkSearch;
  readonly maxQuestionChars: number;
}

/** Números de una pregunta; nunca su texto ni la respuesta. Tiempos en ms desde que empieza la pregunta. */
interface QuestionTiming {
  readonly failed: boolean;
  readonly fragments: number;
  readonly bestSimilarity?: number | undefined;
  readonly firstFragmentMs?: number;
  readonly modelFirstChunkMs?: number;
  readonly maxGapMs?: number | undefined;
}

const writeLine = (stream: NodeJS.WriteStream, payload: Record<string, unknown>): void => {
  stream.write(`${JSON.stringify(payload)}\n`);
};

const round = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.round(value);

/** Momento de cada `delta` de la respuesta (CA-2 mide el primero; los huecos, el plazo entre trozos). */
async function deltaTimes(events: AsyncIterable<AgentAnswerEvent>): Promise<number[]> {
  const times: number[] = [];
  for await (const event of events) if (event.type === 'delta') times.push(performance.now());
  return times;
}

function maxGap(times: readonly number[]): number | undefined {
  const gaps = times.slice(1).map((time, index) => time - (times[index] ?? time));
  return gaps.length === 0 ? undefined : Math.max(...gaps);
}

/** Recupera y, si hay fragmentos y `withModel`, compone con Gemini midiendo cada tramo. */
async function timeQuestion(
  pipeline: Pipeline,
  text: string,
  withModel: boolean,
): Promise<QuestionTiming> {
  const started = performance.now();
  const question = AgentQuestion.parse(text, pipeline.maxQuestionChars);
  const { fragments } = await pipeline.retriever.retrieve(MEASURER, {
    question,
    scope: { type: 'all' },
  });
  const retrievedAt = performance.now();
  const base = {
    failed: false,
    fragments: fragments.length,
    bestSimilarity: pipeline.search.bestSimilarities.at(-1),
  };
  if (!withModel || fragments.length === 0) return base;
  const request = { question, fragments, usage: MEASUREMENT_USAGE };
  const times = await deltaTimes(pipeline.composer.compose(request, new AbortController().signal));
  const first = times[0];
  if (first === undefined) return base;
  return {
    ...base,
    firstFragmentMs: first - started,
    modelFirstChunkMs: first - retrievedAt,
    maxGapMs: maxGap(times),
  };
}

/** Un proveedor caído o lento a mitad de la corrida cuenta como fallo de esa pregunta y la medición sigue. */
async function measureQuestion(
  pipeline: Pipeline,
  text: string,
  withModel: boolean,
): Promise<QuestionTiming> {
  try {
    return await timeQuestion(pipeline, text, withModel);
  } catch (error) {
    if (error instanceof AgentUnavailableError) return { failed: true, fragments: 0 };
    throw error;
  }
}

async function measureSet(
  pipeline: Pipeline,
  set: 'answerable' | 'unanswerable',
): Promise<QuestionTiming[]> {
  const questions = set === 'answerable' ? ANSWERABLE_QUESTIONS : UNANSWERABLE_QUESTIONS;
  const timings: QuestionTiming[] = [];
  for (const [index, text] of questions.entries()) {
    const timing = await measureQuestion(pipeline, text, set === 'answerable');
    timings.push(timing);
    writeLine(process.stdout, {
      event: 'agent.measure.question',
      set,
      index,
      ...roundTiming(timing),
    });
  }
  return timings;
}

function roundTiming(timing: QuestionTiming): Record<string, unknown> {
  return {
    failed: timing.failed,
    fragments: timing.fragments,
    bestSimilarity: timing.bestSimilarity,
    firstFragmentMs: round(timing.firstFragmentMs),
    modelFirstChunkMs: round(timing.modelFirstChunkMs),
    maxGapMs: round(timing.maxGapMs),
  };
}

const defined = (values: readonly (number | undefined)[]): number[] =>
  values.filter((value): value is number => value !== undefined);

/** Las dos series de la corrida, en el orden de sus preguntas. */
interface Measurement {
  readonly answerable: readonly QuestionTiming[];
  readonly unanswerable: readonly QuestionTiming[];
}

const firstFragmentsOf = (measurement: Measurement): number[] =>
  defined(measurement.answerable.map((timing) => timing.firstFragmentMs));

function questionCounts({ answerable, unanswerable }: Measurement): Record<string, number> {
  return {
    answerable: answerable.length,
    unanswerable: unanswerable.length,
    measured: firstFragmentsOf({ answerable, unanswerable }).length,
    withoutFragments: answerable.filter((timing) => !timing.failed && timing.fragments === 0)
      .length,
    failed: [...answerable, ...unanswerable].filter((timing) => timing.failed).length,
  };
}

function proposals({ answerable, unanswerable }: Measurement): Record<string, unknown> {
  return {
    MIN_SIMILARITY: proposeMinSimilarity({
      answerable: defined(answerable.map((timing) => timing.bestSimilarity)),
      unanswerable: defined(unanswerable.map((timing) => timing.bestSimilarity)),
    }),
    AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS: proposeTimeoutMs(
      defined(answerable.map((timing) => timing.modelFirstChunkMs)),
    ),
    AGENT_MODEL_IDLE_TIMEOUT_MS: proposeTimeoutMs(
      defined(answerable.map((timing) => timing.maxGapMs)),
    ),
  };
}

/** Resumen de la corrida: CA-2, umbral de CA-3 y plazos propuestos frente a los vigentes. */
function summarize(env: MeasureEnv, measurement: Measurement): Record<string, unknown> {
  const firstFragments = firstFragmentsOf(measurement);
  return {
    event: 'agent.measure.completed',
    models: { chat: env.GEMINI_CHAT_MODEL, embedding: env.GEMINI_EMBEDDING_MODEL },
    questions: questionCounts(measurement),
    firstFragment: {
      p95Ms: round(percentile(firstFragments, P95)),
      budgetMs: FIRST_FRAGMENT_BUDGET_MS,
      meetsCa2: meetsFirstFragmentBudget(firstFragments, ANSWERABLE_QUESTIONS.length),
    },
    proposals: proposals(measurement),
    current: {
      MIN_SIMILARITY,
      AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS: env.AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS,
      AGENT_MODEL_IDLE_TIMEOUT_MS: env.AGENT_MODEL_IDLE_TIMEOUT_MS,
    },
  };
}

/** Embeddings y chat reales con plazos holgados, el corpus vectorizado y las piezas del agente sobre él. */
async function buildPipeline(env: MeasureEnv, apiKey: string): Promise<Pipeline> {
  const baseUrl = GEMINI_API_BASE_URL;
  const embeddings = new GeminiEmbeddingProvider({
    apiKey,
    model: env.GEMINI_EMBEDDING_MODEL,
    baseUrl,
  });
  const model = new GeminiFlashModel({
    apiKey,
    model: env.GEMINI_CHAT_MODEL,
    baseUrl,
    firstChunkTimeoutMs: MEASUREMENT_TIMEOUT_MS,
    idleTimeoutMs: MEASUREMENT_TIMEOUT_MS,
  });
  const corpus = await buildMeasurementCorpus(embeddings);
  writeLine(process.stdout, {
    event: 'agent.measure.corpus',
    documents: corpus.documents,
    chunks: corpus.chunks.length,
  });
  const search = new MemoryChunkSearch(corpus.chunks);
  const retriever = new HybridRetriever(
    embeddings,
    search,
    new FakeTransactionRunner(new Journal()),
  );
  return {
    retriever,
    composer: new AnswerComposer(model),
    search,
    maxQuestionChars: env.AGENT_MAX_QUESTION_CHARS,
  };
}

/**
 * Medición opt-in del agente (020 T-09, CA-2 y CA-3): `pnpm --filter api agent:measure`. Genera su corpus (S-5), lo
 * vectoriza con Gemini real, hace las 20 preguntas con respuesta (p95 del primer fragmento, plazos) y las 10 sin
 * respuesta (similitud), y propone `MIN_SIMILARITY` y los plazos. No corre en CI. Imprime solo números y nombres de
 * modelo: nunca la clave, las preguntas, los fragmentos ni las respuestas.
 */
async function main(): Promise<void> {
  loadDotenvFile();
  const config = loadEnv(measureEnvSchema);
  if (!config.ok) {
    writeLine(process.stderr, { event: 'config.invalid', issues: config.issues });
    process.exit(1);
  }
  const apiKey = config.env.GEMINI_API_KEY;
  if (apiKey === undefined) {
    writeLine(process.stderr, { event: 'agent.measure.missing_key', message: MISSING_KEY_MESSAGE });
    process.exit(1);
  }
  const pipeline = await buildPipeline(config.env, apiKey);
  const answerable = await measureSet(pipeline, 'answerable');
  const unanswerable = await measureSet(pipeline, 'unanswerable');
  writeLine(process.stdout, summarize(config.env, { answerable, unanswerable }));
}

main().catch((error: unknown) => {
  writeLine(process.stderr, { event: 'agent.measure.failed', errorClass: errorClassOf(error) });
  process.exit(1);
});
