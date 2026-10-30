import { agentStatusSchema } from '@nimbo/contracts';

import { FakeLanguageModel } from '../../support/fake-language-model';
import { PRO_ID } from '../billing/subscription-accounts';

import { createAgentWorld, currentPersonalPeriod } from './agent-http';
import type { AgentWorld } from './agent-http';

const PERSONAL_LIMIT = 20;
const PRO_LIMIT = 500;
const MAX_QUESTION_CHARS = 1000;
const DAY_MS = 86_400_000;
const PERIOD_DAYS = 30;
const QUESTION = '¿Cuál es el presupuesto aprobado?';
const FRAGMENT = {
  name: 'presupuesto.pdf',
  text: 'El presupuesto aprobado es de 10 000 quetzales.',
};

/**
 * `GET /agent/status` y el contador visto por HTTP (plan 020 §4, T-07): `billing` real con la tabla `plan` sembrada.
 * Personal sin fila de `suscripcion` usa el mes de Guatemala (RN-4); la solo lectura, el plan que conserva (CA-14).
 */
describe('GET /agent/status (spec 020 CA-7, CA-10, CA-13, CA-14; S-3)', () => {
  let world: AgentWorld;

  beforeAll(async () => {
    world = await createAgentWorld();
  });

  beforeEach(() => {
    world.model.reset();
  });

  afterAll(async () => {
    await world?.close();
  });

  /** Pro vencido hace un día y en solo lectura (010): el periodo no se renueva solo (P-9). */
  const readOnlyPro = async (userId: string): Promise<void> => {
    const expired = new Date(Date.now() - DAY_MS);
    await world.owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en, estado)
       VALUES ($1, $2, $3, $4, 'solo_lectura')`,
      [userId, PRO_ID, new Date(expired.getTime() - PERIOD_DAYS * DAY_MS), expired],
    );
  };

  it('CA-10: usadas, total de Personal, renovación del mes de Guatemala, `hasIndexedFiles` y el máximo (S-3)', async () => {
    const ana = await world.newClient();
    await world.indexedFile(ana, FRAGMENT);
    await world.setUsedThisPeriod(ana, 3);

    const { status, body } = await world.status(ana);

    expect(status).toBe(200);
    expect(agentStatusSchema.parse(body)).toEqual({
      used: 3,
      limit: PERSONAL_LIMIT,
      resetsAt: currentPersonalPeriod().resetsAt?.toISOString(),
      hasIndexedFiles: true,
      maxQuestionChars: MAX_QUESTION_CHARS,
    });
  });

  it('CA-7: sin versiones vigentes indexadas, `hasIndexedFiles` es falso', async () => {
    const ana = await world.newClient();

    const { body } = await world.status(ana);

    expect(body).toMatchObject({ used: 0, hasIndexedFiles: false });
  });

  it('CA-13: el contador del periodo anterior no cuenta en el nuevo', async () => {
    const ana = await world.newClient();
    await world.indexedFile(ana, FRAGMENT);
    const previous = new Date(currentPersonalPeriod().startsAt.getTime() - DAY_MS);
    await world.owner.query(
      'INSERT INTO uso_agente (usuario_id, periodo_inicio, consultas) VALUES ($1, $2, $3)',
      [ana, previous, PERSONAL_LIMIT],
    );
    world.model.use(new FakeLanguageModel(['El presupuesto es de 10 000 [1].']));

    const asked = await world.ask(ana, { question: QUESTION });

    expect(asked.status).toBe(200);
    await expect(world.status(ana)).resolves.toMatchObject({ body: { used: 1 } });
  });

  it('CA-14: en solo lectura pregunta, consume del plan que conserva y no informa renovación', async () => {
    const ana = await world.newClient();
    await world.indexedFile(ana, FRAGMENT);
    await readOnlyPro(ana);
    world.model.use(new FakeLanguageModel(['El presupuesto es de 10 000 [1].']));

    const asked = await world.ask(ana, { question: QUESTION });

    expect(asked.status).toBe(200);
    expect(asked.events.at(-1)).toMatchObject({ type: 'done', used: 1, limit: PRO_LIMIT });
    await expect(world.status(ana)).resolves.toMatchObject({
      body: { used: 1, limit: PRO_LIMIT, resetsAt: null },
    });
  });
});
