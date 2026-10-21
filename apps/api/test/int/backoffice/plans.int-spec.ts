import { randomUUID } from 'node:crypto';

import {
  BILLING_ERROR_CODES,
  errorResponseSchema,
  planAdminListResponseSchema,
  planAdminViewSchema,
} from '@nimbo/contracts';
import type { PlanAdminView } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { AppModule } from '../../../src/app.module';
import { I_AUDIT_LOGGER } from '../../../src/modules/audit';
import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

const PLANS = '/api/v1/backoffice/plans';
/** 100 GiB: no cabe en un entero de 32 bits y viaja como texto decimal (ADR-0016). */
const HUNDRED_GIB = '107374182400';

type Http = ReturnType<typeof request>;

/** Cuerpo válido de `POST /backoffice/plans` con un nombre único por llamada. */
const newPlanBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: `Plan de prueba ${randomUUID().slice(0, 8)}`,
  description: 'Plan sembrado por la suite del catálogo',
  priceCents: 45_000,
  quotaBytes: HUNDRED_GIB,
  maxFileBytes: '524288000',
  maxEditors: 3,
  agentQueriesPerMonth: 500,
  retainedVersions: 30,
  trashRetentionDays: 30,
  ...overrides,
});

/**
 * Catálogo de planes del Administrador (011 CA-8 a CA-11, RN-4; plan §4, §7 R-3) contra la API completa (`AppModule`)
 * con tokens reales. Los planes que se crean por HTTP o se siembran como el dueño se borran al final; los conteos de
 * clientes salen de filas de `suscripcion` sembradas por la suite.
 */
describe('`/backoffice/plans` (011 CA-8 a CA-11)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  let adminToken = '';
  let adminId = '';
  const accounts: string[] = [];
  const plans: string[] = [];

  const http = (app: TestApp = testApp): Http => request(app.app.getHttpServer());
  const asAdmin = (call: request.Test, correlationId: string = randomUUID()): request.Test =>
    call.set('Authorization', `Bearer ${adminToken}`).set('X-Correlation-Id', correlationId);

  const list = (): request.Test => asAdmin(http().get(PLANS));
  const create = (body: Record<string, unknown>, correlationId?: string): request.Test =>
    asAdmin(http().post(PLANS).send(body), correlationId);
  const deactivate = (id: string, correlationId?: string): request.Test =>
    asAdmin(http().post(`${PLANS}/${id}/deactivation`), correlationId);

  const viewOf = (response: Response, status: number): PlanAdminView => {
    expect(response.status).toBe(status);
    const view = planAdminViewSchema.parse(response.body);
    plans.push(view.id);
    return view;
  };

  const errorOf = (response: Response, status: number) => {
    expect(response.status).toBe(status);
    return errorResponseSchema.parse(response.body);
  };

  const planIdBySlug = async (slug: string): Promise<string> => {
    const [row] = (await owner.query('SELECT id FROM plan WHERE slug = $1', [slug])) as {
      id: string;
    }[];
    if (row === undefined) throw new Error('plan no sembrado');
    return row.id;
  };

  const planEvents = async (planId: string, action: string): Promise<unknown[]> =>
    (await owner.query(
      `SELECT usuario_afectado_id AS "targetUserId", tipo_recurso AS "resourceType"
         FROM evento_auditoria WHERE recurso_id = $1 AND accion = $2 AND actor_id = $3`,
      [planId, action, adminId],
    )) as unknown[];

  const plansNamed = async (name: string): Promise<number> => {
    const [row] = (await owner.query('SELECT count(*)::int AS total FROM plan WHERE nombre = $1', [
      name,
    ])) as { total: number }[];
    return row?.total ?? 0;
  };

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    adminId = await insertAccount(owner, Role.ADMIN);
    accounts.push(adminId);
    ({ token: adminToken } = await issuer.issueAccessToken({
      userId: adminId,
      role: Role.ADMIN,
      sessionId: randomUUID(),
    }));
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, accounts);
    await owner?.query('DELETE FROM evento_auditoria WHERE recurso_id = ANY($1::uuid[])', [plans]);
    await owner?.query('DELETE FROM plan WHERE id = ANY($1::uuid[])', [plans]);
    await owner?.destroy();
  });

  describe('lista (CA-8)', () => {
    it('CA-8: activos y desactivados, con su conteo de clientes con suscripción y Personal como plan por omisión', async () => {
      const active = viewOf(await create(newPlanBody()), 201);
      const retired = viewOf(await create(newPlanBody()), 201);
      expect((await deactivate(retired.id)).status).toBe(200);
      const client = await insertAccount(owner, Role.CLIENT);
      accounts.push(client);
      await owner.query('INSERT INTO suscripcion (usuario_id, plan_id) VALUES ($1, $2)', [
        client,
        retired.id,
      ]);

      const response = await list();

      expect(response.status).toBe(200);
      const { items } = planAdminListResponseSchema.parse(response.body);
      const byId = new Map(items.map((item) => [item.id, item]));
      expect(byId.get(active.id)).toMatchObject({
        deactivatedAt: null,
        clientCount: 0,
        quotaBytes: HUNDRED_GIB,
      });
      expect(byId.get(retired.id)).toMatchObject({ clientCount: 1, isDefault: false });
      expect(byId.get(retired.id)?.deactivatedAt).not.toBeNull();
      expect(items.filter((item) => item.isDefault).map((item) => item.slug)).toEqual(['personal']);
    });
  });

  describe('crear (CA-9, CA-11)', () => {
    it('CA-9: crea el plan activo con su `slug`, responde 201 y lo audita sin afectado', async () => {
      const body = newPlanBody();

      const view = viewOf(await create(body), 201);

      expect(view).toMatchObject({
        name: body.name,
        deactivatedAt: null,
        clientCount: 0,
        isDefault: false,
      });
      expect(view.slug).toMatch(/^plan-de-prueba-/);
      expect(await planEvents(view.id, 'plan.created')).toEqual([
        { targetUserId: null, resourceType: 'plan' },
      ]);
    });

    it('CA-11: un nombre repetido → `422 BILLING_PLAN_INVALID` con `name` `NAME_TAKEN` y no crea otro', async () => {
      const first = viewOf(await create(newPlanBody()), 201);

      const error = errorOf(await create(newPlanBody({ name: first.name })), 422);

      expect(error.code).toBe(BILLING_ERROR_CODES.BILLING_PLAN_INVALID);
      expect(error.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual([
        'name:NAME_TAKEN',
      ]);
      expect(await plansNamed(first.name)).toBe(1);
    });

    it.each([
      ['un precio negativo (regla de `billing`)', { priceCents: -1 }, 'priceCents'],
      ['bytes como número (forma del contrato)', { quotaBytes: 1024 }, 'quotaBytes'],
      ['un `slug` (lo deriva el servidor)', { slug: 'mio' }, 'slug'],
    ])(
      'CA-11: %s → `422 BILLING_PLAN_INVALID` con el campo y no crea nada',
      async (_case, patch, field) => {
        const body = newPlanBody(patch);

        const error = errorOf(await create(body), 422);

        expect(error.code).toBe(BILLING_ERROR_CODES.BILLING_PLAN_INVALID);
        expect(error.fields?.map((issue) => issue.field)).toContain(field);
        expect(await plansNamed(String(body.name))).toBe(0);
      },
    );

    it('RNF-17: `backoffice.plan.created` lleva solo ids, sin el nombre del plan', async () => {
      const body = newPlanBody();
      const correlationId = randomUUID();

      const view = viewOf(await create(body, correlationId), 201);

      const lines = testApp.logs.withCorrelationId(correlationId);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'backoffice.plan.created',
            actorId: adminId,
            planId: view.id,
          }),
        ]),
      );
      expect(JSON.stringify(lines)).not.toContain(String(body.name));
    });
  });

  describe('desactivar (CA-10, CA-11)', () => {
    it('CA-10: guarda la fecha, el plan queda desactivado, se audita y deja su bitácora', async () => {
      const plan = viewOf(await create(newPlanBody()), 201);
      const correlationId = randomUUID();

      const response = await deactivate(plan.id, correlationId);

      expect(response.status).toBe(200);
      const view = planAdminViewSchema.parse(response.body);
      expect(view.id).toBe(plan.id);
      expect(view.deactivatedAt).not.toBeNull();
      expect(await planEvents(plan.id, 'plan.deactivated')).toEqual([
        { targetUserId: null, resourceType: 'plan' },
      ]);
      expect(testApp.logs.withCorrelationId(correlationId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'backoffice.plan.deactivated',
            actorId: adminId,
            planId: plan.id,
          }),
        ]),
      );
    });

    it('CA-10 (CAS): dos desactivaciones a la vez → una 200 y otra `409 BILLING_PLAN_ALREADY_DEACTIVATED`, con un solo evento', async () => {
      const plan = viewOf(await create(newPlanBody()), 201);

      const responses = await Promise.all([deactivate(plan.id), deactivate(plan.id)]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const denied = responses.find((response) => response.status === 409);
      expect(errorResponseSchema.parse(denied?.body).code).toBe(
        BILLING_ERROR_CODES.BILLING_PLAN_ALREADY_DEACTIVATED,
      );
      expect(await planEvents(plan.id, 'plan.deactivated')).toHaveLength(1);
    });

    it('CA-11: Personal → `409 BILLING_PLAN_NOT_DEACTIVATABLE` y sigue activo', async () => {
      const personal = await planIdBySlug('personal');

      const error = errorOf(await deactivate(personal), 409);

      expect(error.code).toBe(BILLING_ERROR_CODES.BILLING_PLAN_NOT_DEACTIVATABLE);
      const [row] = (await owner.query('SELECT desactivado_en FROM plan WHERE id = $1', [
        personal,
      ])) as { desactivado_en: Date | null }[];
      expect(row?.desactivado_en).toBeNull();
    });

    it('plan §4: un plan inexistente y un `:id` que no es UUID reciben el mismo `404 PLAN_NOT_FOUND`', async () => {
      const correlationId = randomUUID();
      const unknown = await deactivate(randomUUID(), correlationId);
      const malformed = await deactivate('no-es-un-uuid', correlationId);

      expect(errorOf(unknown, 404).code).toBe('PLAN_NOT_FOUND');
      expect({ status: malformed.status, body: malformed.body }).toEqual({
        status: unknown.status,
        body: unknown.body,
      });
    });
  });

  /**
   * Va al final: la segunda app reemplaza el logger raíz de `nestjs-pino`, que es estático, y las bitácoras de las
   * pruebas siguientes ya no llegarían al `LogSink` de `testApp`.
   */
  describe('atomicidad (plan §7 R-3)', () => {
    it('plan §7 R-3: si el evento no se guarda, el plan tampoco queda', async () => {
      const env = buildTestEnv();
      const failingAudit = {
        record: (): Promise<void> => Promise.resolve(),
        recordInTransaction: (): Promise<void> =>
          Promise.reject(new Error('no se pudo guardar el evento')),
      };
      const brokenApp = await createTestApp({
        modules: [AppModule.forRoot(env)],
        validatedEnv: env,
        accessTokenStrategy: 'identity',
        overrides: [{ provide: I_AUDIT_LOGGER, useValue: failingAudit }],
      });
      const { token } = await realAccessTokenIssuer(env).issueAccessToken({
        userId: adminId,
        role: Role.ADMIN,
        sessionId: randomUUID(),
      });
      const body = newPlanBody();

      try {
        const response = await http(brokenApp)
          .post(PLANS)
          .set('Authorization', `Bearer ${token}`)
          .send(body);
        expect(response.status).toBe(500);
      } finally {
        await brokenApp.close();
      }
      expect(await plansNamed(String(body.name))).toBe(0);
    });
  });
});
