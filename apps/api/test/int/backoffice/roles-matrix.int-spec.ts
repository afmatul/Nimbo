import { randomUUID } from 'node:crypto';

import { errorResponseSchema, SHARED_ERROR_CODES } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createFullApiTestApp, emailOfAccount } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

type Http = ReturnType<typeof request>;

/** Una ruta del backoffice; T-10 y T-11 suman las de cuentas, métricas y catálogo. */
interface BackofficeRoute {
  readonly name: string;
  call(http: Http, token: string, clientEmail: string): request.Test;
}

/** Quién no puede usar la ruta: por rol (`@Roles`) o por estar suspendido con su token aún vigente (RN-7, 002 D-10). */
interface DeniedCaller {
  readonly name: string;
  readonly role: Role;
  readonly suspended: boolean;
}

const ROUTES: readonly BackofficeRoute[] = [
  {
    name: 'GET /backoffice/client-files',
    call: (http, token, clientEmail) =>
      http
        .get('/api/v1/backoffice/client-files')
        .query({ email: clientEmail })
        .set('Authorization', `Bearer ${token}`),
  },
];

const DENIED: readonly DeniedCaller[] = [
  { name: 'un Cliente', role: Role.CLIENT, suspended: false },
  { name: 'un Operador', role: Role.OPERATOR, suspended: false },
  { name: 'Soporte suspendido', role: Role.SUPPORT, suspended: true },
  { name: 'un Administrador suspendido', role: Role.ADMIN, suspended: true },
];

/**
 * Matriz rol × ruta del backoffice (011 CA-14; plan §6) contra la API completa (`AppModule`) con tokens reales de
 * `identity`: cada combinación prohibida responde `403 SHARED_FORBIDDEN` y no deja ningún evento en la auditoría del
 * cliente.
 */
describe('matriz de roles del backoffice (011 CA-14)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  const created: string[] = [];
  let client = { id: '', email: '' };

  const newAccount = async (role: Role, suspended = false): Promise<string> => {
    const id = await insertAccount(owner, role);
    created.push(id);
    if (suspended) {
      await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [id]);
    }
    return id;
  };

  const tokenFor = async (caller: DeniedCaller): Promise<string> => {
    const userId = await newAccount(caller.role, caller.suspended);
    const issued = await issuer.issueAccessToken({
      userId,
      role: caller.role,
      sessionId: randomUUID(),
    });
    return issued.token;
  };

  const eventsOn = async (userId: string): Promise<number> => {
    const rows = (await owner.query(
      'SELECT count(*)::int AS total FROM evento_auditoria WHERE usuario_afectado_id = $1',
      [userId],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    const id = await newAccount(Role.CLIENT);
    client = { id, email: await emailOfAccount(owner, id) };
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  describe.each(ROUTES)('$name', (route) => {
    it.each(DENIED)('CA-14: $name recibe `403 SHARED_FORBIDDEN` sin auditoría', async (caller) => {
      const http = request(testApp.app.getHttpServer());
      const response: Response = await route.call(http, await tokenFor(caller), client.email);

      expect(response.status).toBe(403);
      expect(errorResponseSchema.parse(response.body).code).toBe(SHARED_ERROR_CODES.FORBIDDEN);
      expect(await eventsOn(client.id)).toBe(0);
    });
  });
});
