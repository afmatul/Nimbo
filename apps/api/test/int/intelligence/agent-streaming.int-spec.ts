import type { AgentEvent } from '@nimbo/contracts';

import { createAgentWorld, GatedLanguageModel, parseFrames } from './agent-http';
import type { AgentWorld } from './agent-http';

const QUESTION = '¿Cuál es el presupuesto aprobado?';
const FIRST_PART = 'El presupuesto aprobado ';
const REST = ['es de 10 000 quetzales [1].'];

/** Lee marcos del flujo hasta tener al menos `count` eventos. */
async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  count: number,
): Promise<AgentEvent[]> {
  const decoder = new TextDecoder();
  const events: AgentEvent[] = [];
  let pending = '';
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseFrames(pending + decoder.decode(value, { stream: true }));
    events.push(...parsed.events);
    pending = parsed.rest;
  }
  return events;
}

/**
 * Sin buffering (CA-2, plan 020 D-6): el primer evento llega al cliente mientras el modelo todavía no termina, con las
 * cabeceras que impiden a un proxy almacenar o comprimir el flujo. La medición del p95 con Gemini real es T-09.
 */
describe('POST /agent/ask en streaming (spec 020 CA-2, D-6)', () => {
  let world: AgentWorld;

  beforeAll(async () => {
    world = await createAgentWorld();
  });

  afterAll(async () => {
    await world?.close();
  });

  it('CA-2: el primer `delta` llega antes de que el modelo termine y el resto sigue en el mismo flujo', async () => {
    const ana = await world.newClient();
    await world.indexedFile(ana, {
      name: 'presupuesto.pdf',
      text: `${FIRST_PART}${REST.join('')}`,
    });
    const gated = new GatedLanguageModel([FIRST_PART], REST);
    world.model.use(gated);

    const response = await world.askRaw(ana, { question: QUESTION });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = await readEvents(reader, 1);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(first).toEqual([{ type: 'delta', text: FIRST_PART }]);

    gated.open();
    const rest = await readEvents(reader, Number.POSITIVE_INFINITY);
    expect(rest.map(({ type }) => type)).toEqual(['citation', 'delta', 'done']);
  });
});
