import { randomUUID } from 'node:crypto';

import { backofficeMetricsResponseSchema } from '@nimbo/contracts';
import type { BackofficeMetricsResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

const METRICS = '/api/v1/backoffice/metrics';
/** Más de 2^31: la suma viaja como texto decimal (ADR-0016). */
const LARGE_USED_BYTES = 3_221_225_472n;
const SMALL_USED_BYTES = 4096n;
/** Fecha con la que se siembran los planes desactivados. */
const RETIRED_AT = new Date('2026-10-10T09:00:00.000Z');
/** Claves que nunca salen del tablero: nada que identifique una cuenta. */
const ACCOUNT_ROW_KEYS = ['id', 'email', 'fullName', 'userId', 'usedBytes', 'status'];

type PlanCount = BackofficeMetricsResponse['byPlan'][number];

/**
 * Tablero de métricas (011 CA-12; plan §4) contra la API completa (`AppModule`) con tokens reales. La base es compartida
 * con otras suites (en serie), así que los conteos se comparan como diferencias entre dos lecturas alrededor de lo que
 * siembra esta suite. Cuentas, suscripciones y planes se siembran como el dueño (*fixtures*).
 */
describe('`GET /backoffice/metrics` (011 CA-12)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  const accounts: string[] = [];
  const plans: string[] = [];
  let admin = '';
  let operator = '';

  const newAccount = async (role: Role, status: 'activa' | 'suspendida' = 'activa') => {
    const id = await insertAccount(owner, role);
    accounts.push(id);
    await owner.query('UPDATE usuario SET estado = $1 WHERE id = $2', [status, id]);
    return id;
  };

  /** Copia del plan Equipo con otro nombre y `slug`; desactivada en `deactivatedAt` si se da. */
  const newPlan = async (deactivatedAt: Date | null): Promise<string> => {
    const slug = `metricas-${randomUUID()}`;
    const rows = (await owner.query(
      `INSERT INTO plan (nombre, slug, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
                         consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera, desactivado_en)
       SELECT $1, $1, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
              consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera, $2
         FROM plan WHERE slug = 'equipo'
       RETURNING id`,
      [slug, deactivatedAt],
    )) as { id: string }[];
    const [row] = rows;
    if (row === undefined) throw new Error('plan no sembrado');
    plans.push(row.id);
    return row.id;
  };

  const subscribe = (userId: string, planId: string): Promise<unknown> =>
    owner.query('INSERT INTO suscripcion (usuario_id, plan_id) VALUES ($1, $2)', [userId, planId]);

  const setUsedBytes = (userId: string, bytes: bigint): Promise<unknown> =>
    owner.query('UPDATE usuario SET espacio_usado = $1 WHERE id = $2', [bytes.toString(), userId]);

  const metricsAs = async (userId: string, role: Role): Promise<BackofficeMetricsResponse> => {
    const { token } = await issuer.issueAccessToken({ userId, role, sessionId: randomUUID() });
    const response = await request(testApp.app.getHttpServer())
      .get(METRICS)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return backofficeMetricsResponseSchema.parse(response.body);
  };

  const planIn = (metrics: BackofficeMetricsResponse, planId: string): PlanCount | undefined =>
    metrics.byPlan.find((plan) => plan.planId === planId);

  const keysOf = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (value === null || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);
  };

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    admin = await newAccount(Role.ADMIN);
    operator = await newAccount(Role.OPERATOR);
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, accounts);
    await owner?.query('DELETE FROM plan WHERE id = ANY($1::uuid[])', [plans]);
    await owner?.destroy();
  });

  describe('con lo que siembra la suite', () => {
    let before: BackofficeMetricsResponse;
    let after: BackofficeMetricsResponse;
    const seeded = { activeEmpty: '', retiredWithClients: '', retiredEmpty: '', team: '' };

    beforeAll(async () => {
      before = await metricsAs(admin, Role.ADMIN);
      seeded.activeEmpty = await newPlan(null);
      seeded.retiredWithClients = await newPlan(RETIRED_AT);
      seeded.retiredEmpty = await newPlan(RETIRED_AT);
      const [team] = (await owner.query("SELECT id FROM plan WHERE slug = 'equipo'")) as {
        id: string;
      }[];
      if (team === undefined) throw new Error('plan no sembrado');
      seeded.team = team.id;
      const subscribedToTeam = await newAccount(Role.CLIENT);
      const subscribedToRetired = await newAccount(Role.CLIENT, 'suspendida');
      const unsubscribed = await newAccount(Role.CLIENT);
      await newAccount(Role.SUPPORT, 'suspendida');
      await subscribe(subscribedToTeam, seeded.team);
      await subscribe(subscribedToRetired, seeded.retiredWithClients);
      await setUsedBytes(subscribedToTeam, LARGE_USED_BYTES);
      await setUsedBytes(unsubscribed, SMALL_USED_BYTES);
      after = await metricsAs(admin, Role.ADMIN);
    });

    it('CA-12: cuentas por rol y por estado, como diferencia de lo sembrado', () => {
      expect(after.accounts.total - before.accounts.total).toBe(4);
      expect(after.accounts.clients - before.accounts.clients).toBe(3);
      expect(after.accounts.internal - before.accounts.internal).toBe(1);
      expect(after.accounts.byStatus.active - before.accounts.byStatus.active).toBe(2);
      expect(after.accounts.byStatus.suspended - before.accounts.byStatus.suspended).toBe(2);
    });

    it('CA-12: el espacio es la suma de `usuario.espacio_usado`, como texto decimal aunque pase de 2^31', () => {
      expect(BigInt(after.usedBytesTotal) - BigInt(before.usedBytesTotal)).toBe(
        LARGE_USED_BYTES + SMALL_USED_BYTES,
      );
    });

    it('CA-12: un cliente sin suscripción no cuenta en ningún plan', () => {
      const clientsInPlans = (metrics: BackofficeMetricsResponse): number =>
        metrics.byPlan.reduce((total, plan) => total + plan.clientCount, 0);

      expect(clientsInPlans(after) - clientsInPlans(before)).toBe(2);
      expect(planIn(after, seeded.team)?.clientCount).toBe(
        (planIn(before, seeded.team)?.clientCount ?? 0) + 1,
      );
    });

    it('CA-12: un plan activo sin clientes aparece con 0', () => {
      expect(planIn(after, seeded.activeEmpty)).toMatchObject({
        clientCount: 0,
        deactivatedAt: null,
      });
    });

    it('CA-12: un plan desactivado con clientes aparece con su fecha; sin clientes, no aparece', () => {
      expect(planIn(after, seeded.retiredWithClients)).toMatchObject({
        clientCount: 1,
        deactivatedAt: RETIRED_AT.toISOString(),
      });
      expect(planIn(after, seeded.retiredEmpty)).toBeUndefined();
    });

    it('CA-12: solo totales y conteos, nunca filas ni claves de una cuenta', () => {
      expect(keysOf(after).filter((key) => ACCOUNT_ROW_KEYS.includes(key))).toEqual([]);
      for (const id of accounts) {
        expect(JSON.stringify(after)).not.toContain(id);
      }
    });

    it('CA-12: el Operador ve lo mismo que el Administrador', async () => {
      expect(await metricsAs(operator, Role.OPERATOR)).toEqual(await metricsAs(admin, Role.ADMIN));
    });
  });
});
