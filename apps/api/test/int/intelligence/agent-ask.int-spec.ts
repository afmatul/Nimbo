import type { AgentCitationEvent, AgentEvent } from '@nimbo/contracts';

import { AGENT_NOT_FOUND_ANSWER } from '../../../src/modules/intelligence/domain/prompt-builder';
import { sourceLocationFromJson } from '../../../src/modules/intelligence/domain/source-location-json';
import { Role } from '../../../src/shared';
import { FakeLanguageModel } from '../../support/fake-language-model';

import { createAgentWorld, GatedLanguageModel } from './agent-http';
import type { AgentWorld, AskResult } from './agent-http';
import { eventually } from './indexing-world';

const PERSONAL_LIMIT = 20;
const MAX_QUESTION_CHARS = 1000;
/** Clave de mentira: no sale a la red (los proveedores son dobles) y no debe aparecer en ninguna bitácora (CA-18). */
const FAKE_API_KEY = 'clave-gemini-de-prueba-0123456789';
const QUESTION = '¿Cuál es el presupuesto aprobado?';
const UNRELATED_QUESTION = '¿Quién ganó el campeonato?';
const ANSWER = ['El presupuesto aprobado ', 'es de 10 000 quetzales [1][2]', '[3][4][5].'];
const SECRET_TEXT = 'El presupuesto aprobado es de 10 000 quetzales';
const INTERNAL_ROLES = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const;

/** Un archivo por formato con su procedencia como la guarda 019 (RN-6). */
const FORMATS = [
  { name: 'presupuesto.pdf', location: { tipo: 'pdf', pagina: 3, confianza: 1 } },
  {
    name: 'acta.docx',
    location: { tipo: 'docx', seccion: 1, parrafoDesde: 2, parrafoHasta: 4, confianza: 1 },
  },
  { name: 'notas.md', location: { tipo: 'texto', lineaDesde: 10, lineaHasta: 24, confianza: 1 } },
  { name: 'cuentas.xlsx', location: { tipo: 'xlsx', hoja: 'Resumen', confianza: 1 } },
  { name: 'junta.pptx', location: { tipo: 'pptx', numero: 4, confianza: 1 } },
] as const;

const citationsOf = (events: readonly AgentEvent[]): AgentCitationEvent[] =>
  events.filter((event): event is AgentCitationEvent => event.type === 'citation');

const textOf = (events: readonly AgentEvent[]): string =>
  events.map((event) => (event.type === 'delta' ? event.text : '')).join('');

const errorOf = (result: AskResult) => ({ status: result.status, code: result.body.code });

/**
 * `POST /agent/ask` por HTTP (plan 020 §4, T-07): `storage`, `intelligence` y `billing` reales sobre Postgres como
 * `nimbo_app` y Redis; el modelo y los embeddings son dobles (ADR-0007), nunca la clave real. Cada prueba usa cuentas
 * nuevas: el contador y el límite de tasa son por cuenta.
 */
describe('POST /agent/ask (spec 020 CA-1, CA-3, CA-6, CA-7, CA-11 a CA-16, CA-18)', () => {
  let world: AgentWorld;

  beforeAll(async () => {
    world = await createAgentWorld({ GEMINI_API_KEY: FAKE_API_KEY });
  });

  beforeEach(() => {
    world.model.reset();
    world.embedder.reset();
  });

  afterAll(async () => {
    await world?.close();
  });

  const clientWithFiles = async (): Promise<string> => {
    const ana = await world.newClient();
    for (const { name, location } of FORMATS) {
      await world.indexedFile(ana, { name, text: `${SECRET_TEXT}.`, location });
    }
    return ana;
  };

  describe('respuesta', () => {
    it('CA-1: responde en flujo con una cita del servidor por fragmento de cada formato y cierra con el uso', async () => {
      const ana = await clientWithFiles();
      world.model.use(new FakeLanguageModel(ANSWER));

      const result = await world.ask(ana, { question: QUESTION });

      expect(result.status).toBe(200);
      expect(result.headers.get('content-type')).toMatch(/^text\/event-stream/);
      const citations = citationsOf(result.events);
      expect(citations.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3, 4, 5]);
      expect(
        citations.map(({ fileName, label, isCertain }) => [fileName, label, isCertain]),
      ).toEqual(
        expect.arrayContaining(
          FORMATS.map(({ name, location }) => [
            name,
            sourceLocationFromJson(location)?.label(),
            true,
          ]),
        ),
      );
      expect(textOf(result.events)).toBe(ANSWER.join(''));
      expect(result.events.at(-1)).toEqual({
        type: 'done',
        outcome: 'answered',
        used: 1,
        limit: PERSONAL_LIMIT,
      });
      await expect(world.usedThisPeriod(ana)).resolves.toBe(1);
    });

    it('CA-1: cada cita llega antes del texto que la menciona', async () => {
      const ana = await clientWithFiles();
      world.model.use(new FakeLanguageModel(ANSWER));

      const { events } = await world.ask(ana, { question: QUESTION });

      for (const { ordinal } of citationsOf(events)) {
        const cited = events.findIndex(
          (event) => event.type === 'citation' && event.ordinal === ordinal,
        );
        const mentioned = events.findIndex(
          (event) => event.type === 'delta' && event.text.includes(`[${String(ordinal)}]`),
        );
        expect(cited).toBeLessThan(mentioned);
      }
    });

    it('S-1: al modelo solo viajan la pregunta y el texto de los fragmentos, sin nombres de archivo ni ids', async () => {
      const ana = await clientWithFiles();
      world.model.use(new FakeLanguageModel(ANSWER));

      const { events } = await world.ask(ana, { question: QUESTION });

      const sent = JSON.stringify(world.model.prompts);
      expect(sent).toContain(SECRET_TEXT);
      for (const citation of citationsOf(events)) {
        expect(sent).not.toContain(citation.fileName);
        expect(sent).not.toContain(citation.fileId);
      }
    });

    it('CA-3: si ningún fragmento responde, dice la frase fija sin llamar al modelo y cuenta la consulta', async () => {
      const ana = await clientWithFiles();

      const result = await world.ask(ana, { question: UNRELATED_QUESTION });

      expect(result.events).toEqual([
        { type: 'delta', text: AGENT_NOT_FOUND_ANSWER },
        { type: 'done', outcome: 'not_found', used: 1, limit: PERSONAL_LIMIT },
      ]);
      expect(world.model.prompts).toHaveLength(0);
    });

    it('CA-7: sin archivos indexados responde la frase fija sin modelo y sin descontar consulta', async () => {
      const ana = await world.newClient();

      const result = await world.ask(ana, { question: QUESTION });

      expect(result.events).toEqual([
        { type: 'delta', text: AGENT_NOT_FOUND_ANSWER },
        { type: 'done', outcome: 'not_found', used: 0, limit: PERSONAL_LIMIT },
      ]);
      expect(world.model.prompts).toHaveLength(0);
      await expect(world.usedThisPeriod(ana)).resolves.toBe(0);
    });
  });

  describe('validación', () => {
    it.each([
      ['empty', ''],
      ['empty', '   '],
      ['too_long', 'a'.repeat(MAX_QUESTION_CHARS + 1)],
    ])('CA-6: `%s` → 422 con el motivo y sin descontar consulta', async (reason, question) => {
      const ana = await clientWithFiles();

      const result = await world.ask(ana, { question });

      expect(errorOf(result)).toEqual({ status: 422, code: 'AGENT_INVALID_QUESTION' });
      expect(result.body.details).toEqual({ reason });
      expect(result.body.correlationId).toBe(result.correlationId);
      await expect(world.usedThisPeriod(ana)).resolves.toBe(0);
    });

    it('CA-6: un cuerpo sin pregunta es una pregunta vacía', async () => {
      const ana = await world.newClient();

      const result = await world.ask(ana, {});

      expect(errorOf(result)).toEqual({ status: 422, code: 'AGENT_INVALID_QUESTION' });
      expect(result.body.details).toEqual({ reason: 'empty' });
    });

    it('CA-17: un ámbito mal formado responde como uno inexistente', async () => {
      const ana = await clientWithFiles();

      const result = await world.ask(ana, { question: QUESTION, scope: { type: 'file', id: 'x' } });

      expect(errorOf(result)).toEqual({ status: 404, code: 'AGENT_SCOPE_NOT_FOUND' });
    });
  });

  describe('consultas del plan', () => {
    it('CA-11: agotadas, 429 con el límite y la renovación, y el resto de Nimbo responde', async () => {
      const ana = await clientWithFiles();
      await world.setUsedThisPeriod(ana, PERSONAL_LIMIT);

      const result = await world.ask(ana, { question: QUESTION });

      expect(errorOf(result)).toEqual({ status: 429, code: 'AGENT_QUOTA_EXCEEDED' });
      expect(result.body.message).toMatch(/^Usaste tus 20 consultas de este mes\. Se renuevan el /);
      expect(result.body.details).toEqual({ limit: PERSONAL_LIMIT, resetsAt: expect.any(String) });
      expect(world.model.prompts).toHaveLength(0);
      await expect(world.usedThisPeriod(ana)).resolves.toBe(PERSONAL_LIMIT);
      expect(
        (await world.storage.clientFor(ana, world.storage.tokenOf(ana)).folderContents()).status,
      ).toBe(200);
    });

    it('CA-12: con una consulta disponible, de dos preguntas simultáneas una responde y la otra recibe 429', async () => {
      const ana = await clientWithFiles();
      await world.setUsedThisPeriod(ana, PERSONAL_LIMIT - 1);
      world.model.use(new FakeLanguageModel(ANSWER));

      const results = await Promise.all([
        world.ask(ana, { question: QUESTION }),
        world.ask(ana, { question: QUESTION }),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([200, 429]);
      await expect(world.usedThisPeriod(ana)).resolves.toBe(PERSONAL_LIMIT);
    });
  });

  describe('degradación (CA-15)', () => {
    it('CA-15: con el proveedor caído antes del texto, 503 sin descontar y listar sigue respondiendo', async () => {
      const ana = await clientWithFiles();
      world.embedder.mode = 'down';

      const result = await world.ask(ana, { question: QUESTION });

      expect(errorOf(result)).toEqual({ status: 503, code: 'AGENT_UNAVAILABLE' });
      expect(result.body.message).toMatch(
        /^El agente no está disponible\. Tus archivos siguen a salvo\./,
      );
      await expect(world.usedThisPeriod(ana)).resolves.toBe(0);
      expect(
        (await world.storage.clientFor(ana, world.storage.tokenOf(ana)).folderContents()).status,
      ).toBe(200);
    });

    it('CA-15: si el modelo falla antes del primer trozo, 503 sin descontar', async () => {
      const ana = await clientWithFiles();
      world.model.use(new FakeLanguageModel(ANSWER, { failAfter: 0 }));

      const result = await world.ask(ana, { question: QUESTION });

      expect(errorOf(result)).toEqual({ status: 503, code: 'AGENT_UNAVAILABLE' });
      await expect(world.usedThisPeriod(ana)).resolves.toBe(0);
    });

    it('CA-15: si falla a mitad del flujo, llega `error` después de lo enviado, sin `done` y sin descontar', async () => {
      const ana = await clientWithFiles();
      world.model.use(new FakeLanguageModel(ANSWER, { failAfter: 1 }));

      const { status, events } = await world.ask(ana, { question: QUESTION });

      expect(status).toBe(200);
      expect(events[0]).toEqual({ type: 'delta', text: ANSWER[0] });
      expect(events.at(-1)).toEqual({ type: 'error', code: 'AGENT_UNAVAILABLE' });
      expect(events.some((event) => event.type === 'done')).toBe(false);
      await expect(world.usedThisPeriod(ana)).resolves.toBe(0);
    });

    it('S-4: cancelar antes del primer fragmento devuelve la consulta', async () => {
      const ana = await clientWithFiles();
      const gated = new GatedLanguageModel([], ANSWER);
      world.model.use(gated);
      const cancel = new AbortController();

      const pending = world.askRaw(ana, { question: QUESTION }, cancel.signal).catch(() => null);
      await gated.started;
      cancel.abort();
      await pending;

      await eventually(async () => ((await world.usedThisPeriod(ana)) === 0 ? true : null));
    });
  });

  describe('seguridad', () => {
    it.each(INTERNAL_ROLES)(
      'CA-16: %s recibe 403 en ambas rutas y no se procesa nada',
      async (role) => {
        const internal = await world.newClient(role);
        world.storage.testApp.logs.clear();

        const asked = await world.ask(internal, { question: QUESTION });
        const status = await world.status(internal);

        expect(errorOf(asked)).toEqual({ status: 403, code: 'SHARED_FORBIDDEN' });
        expect({ status: status.status, code: status.body.code }).toEqual({
          status: 403,
          code: 'SHARED_FORBIDDEN',
        });
        expect(
          world.storage.testApp.logs.lines().some((line) => line.event === 'agent.asked'),
        ).toBe(false);
        const rows = await world.owner.query<unknown[]>(
          'SELECT 1 FROM uso_agente WHERE usuario_id = $1',
          [internal],
        );
        expect(rows).toHaveLength(0);
      },
    );

    it('CA-18: una línea `agent.asked` con correlación, duración, fragmentos y resultado, sin texto, nombres ni clave', async () => {
      const ana = await clientWithFiles();
      world.model.use(new FakeLanguageModel(ANSWER));

      const result = await world.ask(ana, { question: QUESTION });

      const lines = world.storage.testApp.logs.withCorrelationId(result.correlationId);
      const asked = lines.filter((line) => line.event === 'agent.asked');
      expect(asked).toEqual([
        expect.objectContaining({
          correlationId: result.correlationId,
          durationMs: expect.any(Number),
          fragmentCount: FORMATS.length,
          discarded: 0,
          outcome: 'answered',
        }),
      ]);
      const everything = JSON.stringify(world.storage.testApp.logs.lines());
      for (const forbidden of [
        QUESTION,
        SECRET_TEXT,
        ANSWER[1],
        FAKE_API_KEY,
        ...FORMATS.map(({ name }) => name),
      ]) {
        expect(everything).not.toContain(forbidden);
      }
    });

    it('CA-18: si la búsqueda falla en Postgres, responde 500 y ninguna línea de bitácora lleva la pregunta', async () => {
      const ana = await clientWithFiles();
      world.storage.testApp.logs.clear();
      await world.owner.query('REVOKE SELECT ON fragmento FROM nimbo_app');
      const result = await world
        .ask(ana, { question: QUESTION })
        .finally(() => world.owner.query('GRANT SELECT ON fragmento TO nimbo_app'));

      expect(errorOf(result)).toEqual({ status: 500, code: 'INTERNAL_ERROR' });
      const unhandled = world.storage.testApp.logs
        .withCorrelationId(result.correlationId)
        .find((line) => line.event === 'http.unhandled_error');
      expect(unhandled).toMatchObject({ errorClass: 'QueryFailedError' });
      const everything = JSON.stringify(world.storage.testApp.logs.lines());
      for (const forbidden of [QUESTION, 'presupuesto', '"parameters"', '"driverError"']) {
        expect(everything).not.toContain(forbidden);
      }
      await expect(world.usedThisPeriod(ana)).resolves.toBe(0);
    });
  });
});
