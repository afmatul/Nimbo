import { FakeLanguageModel } from '../../../../test/support/fake-language-model';
import { AgentQuestion } from '../domain/agent-question';
import { AgentUnavailableError } from '../domain/errors';
import { PdfLocation } from '../domain/pdf-location';
import { AGENT_NOT_FOUND_ANSWER } from '../domain/prompt-builder';
import type { RetrievedFragment } from '../domain/retrieved-fragment';
import { SheetLocation } from '../domain/sheet-location';

import {
  APPROXIMATE_LOCATION_NOTICE,
  AnswerComposer,
  UNSUPPORTED_ANSWER_NOTICE,
} from './answer-composer';
import type { AgentAnswerEvent, CompositionRequest } from './answer-composer';

const QUESTION = AgentQuestion.parse('¿Cuál es el plazo de entrega?', 1000);
const USAGE = { used: 3, limit: 20 };

const fragment = (id: string, certain = true): RetrievedFragment => ({
  id: `fragmento-${id}`,
  fileId: `archivo-${id}`,
  versionId: `version-${id}`,
  text: `texto ${id}`,
  location: certain ? PdfLocation.page(4) : SheetLocation.sheet('Ventas', 0.5),
});

const request = (fragments: readonly RetrievedFragment[]): CompositionRequest => ({
  question: QUESTION,
  fragments,
  usage: USAGE,
});

async function collect(
  model: FakeLanguageModel,
  fragments: readonly RetrievedFragment[],
): Promise<AgentAnswerEvent[]> {
  const events: AgentAnswerEvent[] = [];
  const composer = new AnswerComposer(model);
  for await (const event of composer.compose(request(fragments), new AbortController().signal)) {
    events.push(event);
  }
  return events;
}

const textOf = (events: readonly AgentAnswerEvent[]): string =>
  events.map((event) => (event.type === 'delta' ? event.text : '')).join('');

const lastOf = (events: readonly AgentAnswerEvent[]): AgentAnswerEvent | undefined => events.at(-1);

describe('AnswerComposer (plan 020 §2, fila 4)', () => {
  it('CA-1: une el flujo del modelo con citas del servidor, antes del texto que las menciona, y cierra con el uso', async () => {
    const model = new FakeLanguageModel(['El plazo es de 30 días ', '[1].']);

    const events = await collect(model, [fragment('1')]);

    expect(events).toEqual([
      { type: 'delta', text: 'El plazo es de 30 días ' },
      {
        type: 'citation',
        ordinal: 1,
        fileId: 'archivo-1',
        versionId: 'version-1',
        label: 'Página 4',
        isCertain: true,
      },
      { type: 'delta', text: '[1].' },
      { type: 'done', outcome: 'answered', used: 3, limit: 20 },
    ]);
  });

  it('CA-1: al modelo solo viajan la pregunta y el texto de los fragmentos, sin ids', async () => {
    const model = new FakeLanguageModel(['Dato [1].']);

    await collect(model, [fragment('1')]);

    const sent = JSON.stringify(model.prompts);
    expect(sent).toContain('texto 1');
    expect(sent).not.toContain('archivo-1');
    expect(sent).not.toContain('version-1');
  });

  it('CA-3: sin fragmentos responde la frase fija sin llamar al modelo', async () => {
    const model = new FakeLanguageModel(['no debería llamarse']);

    const events = await collect(model, []);

    expect(model.prompts).toHaveLength(0);
    expect(events).toEqual([
      { type: 'delta', text: AGENT_NOT_FOUND_ANSWER },
      { type: 'done', outcome: 'not_found', used: 3, limit: 20 },
    ]);
  });

  it('CA-3: si el modelo dice que no lo encontró, cierra como `not_found` sin aviso extra', async () => {
    const model = new FakeLanguageModel([`«${AGENT_NOT_FOUND_ANSWER}».`]);

    const events = await collect(model, [fragment('1')]);

    expect(textOf(events)).toBe(`«${AGENT_NOT_FOUND_ANSWER}».`);
    expect(lastOf(events)).toEqual({ type: 'done', outcome: 'not_found', used: 3, limit: 20 });
  });

  it('CA-3: una respuesta sin ninguna cita válida suma el aviso del servidor y es `not_found`', async () => {
    const model = new FakeLanguageModel(['Según el contrato son 90 días [7].']);

    const events = await collect(model, [fragment('1')]);

    expect(events.some((event) => event.type === 'citation')).toBe(false);
    expect(textOf(events)).toBe(`Según el contrato son 90 días .${UNSUPPORTED_ANSWER_NOTICE}`);
    expect(lastOf(events)).toEqual({ type: 'done', outcome: 'not_found', used: 3, limit: 20 });
  });

  it('CA-4: con citas de ubicación aproximada lo advierte en el texto una sola vez', async () => {
    const model = new FakeLanguageModel(['Ventas [1] ', 'y costos [2][1].']);

    const events = await collect(model, [fragment('1', false), fragment('2', false)]);

    const citations = events.filter((event) => event.type === 'citation');
    expect(citations.map((event) => event.label)).toEqual([
      'Hoja «Ventas» (ubicación aproximada)',
      'Hoja «Ventas» (ubicación aproximada)',
    ]);
    expect(textOf(events).split(APPROXIMATE_LOCATION_NOTICE)).toHaveLength(2);
    expect(textOf(events).endsWith(APPROXIMATE_LOCATION_NOTICE)).toBe(true);
    expect(lastOf(events)).toMatchObject({ type: 'done', outcome: 'answered' });
  });

  it('CA-4: con citas exactas no agrega la advertencia', async () => {
    const events = await collect(new FakeLanguageModel(['Dato [1].']), [fragment('1')]);

    expect(textOf(events)).not.toContain(APPROXIMATE_LOCATION_NOTICE);
  });

  it('CA-15: si el modelo falla a mitad del flujo, propaga el error tras lo ya emitido y no emite `done`', async () => {
    const model = new FakeLanguageModel(['Dato [1]', ' y más'], { failAfter: 1 });
    const events: AgentAnswerEvent[] = [];
    const composer = new AnswerComposer(model);

    const run = async (): Promise<void> => {
      const signal = new AbortController().signal;
      for await (const event of composer.compose(request([fragment('1')]), signal)) {
        events.push(event);
      }
    };

    await expect(run()).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(events.map((event) => event.type)).toEqual(['citation', 'delta']);
  });
});
