import { randomUUID } from 'node:crypto';

import { errorResponseSchema, SHARED_ERROR_CODES } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import { createFullApiTestApp, emailOfAccount } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

type Http = ReturnType<typeof request>;

/** El cliente sobre el que actúa cada ruta y el plan que desactiva la del catálogo. */
interface Target {
  readonly id: string;
  readonly email: string;
  /** Plan sembrado que la ruta de desactivación usa: no debe quedar desactivado. */
  readonly planId: string;
}

/** Quién no puede usar la ruta: por rol (`@Roles`) o por estar suspendido con su token aún vigente (RN-7, 002 D-10). */
interface DeniedCaller {
  readonly name: string;
  readonly role: Role;
  readonly suspended: boolean;
}

/** Una ruta del backoffice y quiénes no la pueden usar; T-11 suma las del catálogo y la 011b, las de ajustes. */
interface BackofficeRoute {
  readonly name: string;
  readonly denied: readonly DeniedCaller[];
  call(http: Http, token: string, target: Target): request.Test;
}

const CLIENT: DeniedCaller = { name: 'un Cliente', role: Role.CLIENT, suspended: false };
const SUPPORT: DeniedCaller = { name: 'Soporte', role: Role.SUPPORT, suspended: false };
const OPERATOR: DeniedCaller = { name: 'un Operador', role: Role.OPERATOR, suspended: false };
const SUSPENDED_SUPPORT: DeniedCaller = {
  name: 'Soporte suspendido',
  role: Role.SUPPORT,
  suspended: true,
};
const SUSPENDED_ADMIN: DeniedCaller = {
  name: 'un Administrador suspendido',
  role: Role.ADMIN,
  suspended: true,
};
const SUSPENDED_OPERATOR: DeniedCaller = {
  name: 'un Operador suspendido',
  role: Role.OPERATOR,
  suspended: true,
};

const withToken = (call: request.Test, token: string): request.Test =>
  call.set('Authorization', `Bearer ${token}`);

/** Cuentas (CA-1 a CA-6): solo el Administrador activo (CA-14). */
const ACCOUNT_DENIED = [CLIENT, SUPPORT, OPERATOR, SUSPENDED_ADMIN];
const ACCOUNTS = '/api/v1/backoffice/accounts';

/** Un día de fin de vigencia o de extra que las rutas de ajustes aceptarían (011b CA-1, CA-6). */
const IN_A_MONTH = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** Ajustes de cuenta (011b CA-16): solo el Administrador; Soporte, Operador y Cliente reciben `403`. */
const ADJUSTMENT_ROUTES: readonly BackofficeRoute[] = [
  {
    name: 'GET /backoffice/accounts/:id/limits',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) => withToken(http.get(`${ACCOUNTS}/${target.id}/limits`), token),
  },
  {
    name: 'PUT /backoffice/accounts/:id/quota',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) =>
      withToken(http.put(`${ACCOUNTS}/${target.id}/quota`), token).send({
        extraBytes: '1024',
        until: IN_A_MONTH,
      }),
  },
  {
    name: 'DELETE /backoffice/accounts/:id/quota',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) => withToken(http.delete(`${ACCOUNTS}/${target.id}/quota`), token),
  },
];

/** Catálogo (CA-8 a CA-11): solo el Administrador activo (CA-14). */
const PLANS = '/api/v1/backoffice/plans';

const ROUTES: readonly BackofficeRoute[] = [
  {
    name: 'GET /backoffice/client-files',
    denied: [CLIENT, OPERATOR, SUSPENDED_SUPPORT, SUSPENDED_ADMIN],
    call: (http, token, target) =>
      withToken(http.get('/api/v1/backoffice/client-files').query({ email: target.email }), token),
  },
  {
    name: 'GET /backoffice/accounts',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) =>
      withToken(http.get(ACCOUNTS).query({ email: target.email }), token),
  },
  {
    name: 'GET /backoffice/accounts/:id',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) => withToken(http.get(`${ACCOUNTS}/${target.id}`), token),
  },
  {
    name: 'POST /backoffice/accounts/:id/suspension',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) =>
      withToken(http.post(`${ACCOUNTS}/${target.id}/suspension`), token),
  },
  {
    name: 'DELETE /backoffice/accounts/:id/suspension',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) =>
      withToken(http.delete(`${ACCOUNTS}/${target.id}/suspension`), token),
  },
  {
    name: 'POST /backoffice/accounts',
    denied: ACCOUNT_DENIED,
    call: (http, token) =>
      withToken(http.post(ACCOUNTS), token).send({
        fullName: 'Sofía Ramírez',
        email: `alta-${randomUUID()}@nimbo.me`,
        employeeCode: uniqueEmployeeCode(),
        role: Role.SUPPORT,
      }),
  },
  {
    name: 'GET /backoffice/metrics',
    denied: [CLIENT, SUPPORT, SUSPENDED_ADMIN, SUSPENDED_OPERATOR],
    call: (http, token) => withToken(http.get('/api/v1/backoffice/metrics'), token),
  },
  {
    name: 'GET /backoffice/plans',
    denied: ACCOUNT_DENIED,
    call: (http, token) => withToken(http.get(PLANS), token),
  },
  {
    name: 'POST /backoffice/plans',
    denied: ACCOUNT_DENIED,
    call: (http, token) =>
      withToken(http.post(PLANS), token).send({
        name: `Plan de la matriz ${randomUUID().slice(0, 8)}`,
        description: 'Plan que la matriz no debería poder crear',
        priceCents: 4500,
        quotaBytes: '107374182400',
        maxFileBytes: '524288000',
        maxEditors: 3,
        agentQueriesPerMonth: 500,
        retainedVersions: 30,
        trashRetentionDays: 30,
      }),
  },
  {
    name: 'POST /backoffice/plans/:id/deactivation',
    denied: ACCOUNT_DENIED,
    call: (http, token, target) =>
      withToken(http.post(`${PLANS}/${target.planId}/deactivation`), token),
  },
  ...ADJUSTMENT_ROUTES,
];

/** Cada ruta con cada quien no la puede usar. */
const DENIED_CASES = ROUTES.flatMap((route) =>
  route.denied.map((caller): [string, string, BackofficeRoute, DeniedCaller] => [
    route.name,
    caller.name,
    route,
    caller,
  ]),
);

/**
 * Matriz rol × ruta del backoffice (011 CA-14; plan §6) contra la API completa (`AppModule`) con tokens reales de
 * `identity`: cada combinación prohibida responde `403 SHARED_FORBIDDEN`, no cambia el estado del cliente y no deja
 * ningún evento en su auditoría ni a nombre de quien llama.
 */
describe('matriz de roles del backoffice (011 CA-14)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  const created: string[] = [];
  let client: Target = { id: '', email: '', planId: '' };

  const newAccount = async (role: Role, suspended = false): Promise<string> => {
    const id = await insertAccount(owner, role);
    created.push(id);
    if (suspended) {
      await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [id]);
    }
    return id;
  };

  const tokenFor = async (userId: string, caller: DeniedCaller): Promise<string> => {
    const issued = await issuer.issueAccessToken({
      userId,
      role: caller.role,
      sessionId: randomUUID(),
    });
    return issued.token;
  };

  const eventsOn = async (userId: string): Promise<number> => {
    const rows = (await owner.query(
      'SELECT count(*)::int AS total FROM evento_auditoria WHERE usuario_afectado_id = $1 OR actor_id = $1',
      [userId],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  const statusOf = async (userId: string): Promise<string | undefined> => {
    const rows = (await owner.query('SELECT estado FROM usuario WHERE id = $1', [userId])) as {
      estado: string;
    }[];
    return rows[0]?.estado;
  };

  /** El plan sembrado sigue activo: la matriz no puede desactivarlo. */
  const deactivatedAtOf = async (planId: string): Promise<Date | null> => {
    const rows = (await owner.query('SELECT desactivado_en FROM plan WHERE id = $1', [planId])) as {
      desactivado_en: Date | null;
    }[];
    return rows[0]?.desactivado_en ?? null;
  };

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    const id = await newAccount(Role.CLIENT);
    const [plan] = (await owner.query("SELECT id FROM plan WHERE slug = 'pro'")) as {
      id: string;
    }[];
    if (plan === undefined) throw new Error('plan pro no sembrado');
    client = { id, email: await emailOfAccount(owner, id), planId: plan.id };
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it.each(DENIED_CASES)(
    'CA-14: `%s`: %s recibe `403 SHARED_FORBIDDEN` sin auditoría ni cambios',
    async (_route, _caller, route, caller) => {
      const callerId = await newAccount(caller.role, caller.suspended);
      const http = request(testApp.app.getHttpServer());

      const response: Response = await route.call(http, await tokenFor(callerId, caller), client);

      expect(response.status).toBe(403);
      expect(errorResponseSchema.parse(response.body).code).toBe(SHARED_ERROR_CODES.FORBIDDEN);
      expect(await statusOf(client.id)).toBe('activa');
      expect(await deactivatedAtOf(client.planId)).toBeNull();
      expect(await eventsOn(client.id)).toBe(0);
      expect(await eventsOn(callerId)).toBe(0);
    },
  );

  it.each(ADJUSTMENT_ROUTES.map((route): [string, BackofficeRoute] => [route.name, route]))(
    '011b CA-16: `%s` sin token responde `401 SHARED_UNAUTHENTICATED` sin auditoría',
    async (_route, route) => {
      const http = request(testApp.app.getHttpServer());

      const response: Response = await route.call(http, '', client).unset('Authorization');

      expect(response.status).toBe(401);
      expect(errorResponseSchema.parse(response.body).code).toBe(
        SHARED_ERROR_CODES.UNAUTHENTICATED,
      );
      expect(await eventsOn(client.id)).toBe(0);
    },
  );
});
