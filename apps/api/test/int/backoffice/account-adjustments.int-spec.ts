import { randomUUID } from 'node:crypto';

import {
  accountLimitsSchema,
  BACKOFFICE_ERROR_CODES,
  errorResponseSchema,
  IDENTITY_ERROR_CODES,
} from '@nimbo/contracts';
import type { AccountLimits } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { startRestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import { connectTo } from '../../support/database-urls';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, insertFileWithVersion } from '../storage/storage-test-db';

const ACCOUNTS = '/api/v1/backoffice/accounts';
const PRO_PLAN_ID = '10000000-0000-4000-8000-000000000002';
const PERSONAL_PLAN_ID = '10000000-0000-4000-8000-000000000001';
const PRO_QUOTA = 107_374_182_400n;
const FIVE_GIB = 5_368_709_120n;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Guatemala está en UTC−6 todo el año: su medianoche son las 06:00 UTC (RN-1, RN-8). */
const GUATEMALA_OFFSET_MS = 6 * HOUR_MS;

/** El día de Guatemala (`YYYY-MM-DD`) que está `days` días después de hoy en Guatemala. */
const guatemalaDay = (days: number): string =>
  new Date(Date.now() - GUATEMALA_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10);

/** El instante en que deja de regir un día de Guatemala: las 00:00 del día siguiente allí (RN-1). */
const endOfDay = (day: string): Date => new Date(Date.parse(`${day}T06:00:00.000Z`) + DAY_MS);

interface SeededSubscription {
  readonly planId?: string;
  readonly expiresAt?: Date | null;
  readonly readOnly?: boolean;
  readonly usedBytes?: bigint;
}

interface StoredEvent {
  readonly accion: string;
  readonly rol_actor: string;
  readonly atributos: Record<string, unknown>;
}

type Http = ReturnType<typeof request>;

/**
 * Límites y cuota de una cuenta por HTTP (011b CA-1 a CA-4; plan §4, §6) contra la API completa con tokens reales y un
 * Postgres **migrado por un dueño `NOSUPERUSER`** (ADR-0021:73-74): con un superusuario, las funciones
 * `SECURITY DEFINER` ignorarían `FORCE` RLS y ocultarían la falta de la política del dueño. La API usa `nimbo_app`; el
 * estado de la suscripción y la actividad se leen como el propio cliente.
 */
describe('`/backoffice/accounts/:id/limits` y `/quota` con dueño NOSUPERUSER (011b CA-1 a CA-4)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let context: TransactionContext;
  let runner: TypeOrmTransactionRunner;
  let testApp: TestApp;
  let issuer: JwtTokenService;
  let adminToken: string;

  const http = (): Http => request(testApp.app.getHttpServer());

  const as = async <T>(actor: Actor, sql: string, params: unknown[] = []): Promise<T> =>
    (await runner.withActor(actor, () => context.requireActorScope(actor).query(sql, params))) as T;

  const newClient = async (): Promise<Actor> =>
    createActor(await insertAccount(owner, Role.CLIENT), Role.CLIENT);

  /** Un cliente con su suscripción dada de alta por él mismo (`suscripcion_cliente_alta`) y su espacio usado. */
  const aClientWith = async (seed: SeededSubscription = {}): Promise<Actor> => {
    const client = await newClient();
    await as(
      client,
      'INSERT INTO suscripcion (usuario_id, plan_id, vence_en, estado) VALUES ($1, $2, $3, $4)',
      [
        client.id,
        seed.planId ?? PRO_PLAN_ID,
        seed.expiresAt === undefined ? endOfDay(guatemalaDay(10)) : seed.expiresAt,
        seed.readOnly === true ? 'solo_lectura' : 'vigente',
      ],
    );
    await owner.query('UPDATE usuario SET espacio_usado = $2 WHERE id = $1', [
      client.id,
      (seed.usedBytes ?? 0n).toString(),
    ]);
    return client;
  };

  const storedOf = async (client: Actor): Promise<Record<string, unknown> | undefined> =>
    (
      await as<Record<string, unknown>[]>(
        client,
        'SELECT * FROM suscripcion WHERE usuario_id = $1',
        [client.id],
      )
    )[0];

  /** La actividad del cliente, como la lee él mismo (`evento_auditoria_lectura`). */
  const eventsOf = (client: Actor): Promise<StoredEvent[]> =>
    as<StoredEvent[]>(
      client,
      'SELECT accion, rol_actor, atributos FROM evento_auditoria WHERE usuario_afectado_id = $1 ORDER BY ocurrido_en',
      [client.id],
    );

  const filesOf = async (client: Actor): Promise<number> =>
    (await as<{ total: number }[]>(client, 'SELECT count(*)::int AS total FROM archivo', []))[0]
      ?.total ?? 0;

  const asAdmin = (call: request.Test): request.Test =>
    call.set('Authorization', `Bearer ${adminToken}`);
  const getLimits = (id: string): request.Test => asAdmin(http().get(`${ACCOUNTS}/${id}/limits`));
  const putQuota = (id: string, body: Record<string, unknown>): request.Test =>
    asAdmin(http().put(`${ACCOUNTS}/${id}/quota`).send(body));
  const deleteQuota = (id: string): request.Test =>
    asAdmin(http().delete(`${ACCOUNTS}/${id}/quota`));

  const limitsOf = (response: Response): AccountLimits => {
    expect(response.status).toBe(200);
    return accountLimitsSchema.parse(response.body);
  };

  const errorOf = (response: Response, status: number) => {
    expect(response.status).toBe(status);
    return errorResponseSchema.parse(response.body);
  };

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    runner = new TypeOrmTransactionRunner(app, context);
    const env = buildTestEnv({
      DATABASE_URL: database.appUrl,
      DATABASE_MIGRATION_URL: database.ownerUrl,
    });
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
  });

  /** Un Administrador por prueba: el límite de tasa es por cuenta interna (011 T-14). */
  beforeEach(async () => {
    const admin = await insertAccount(owner, Role.ADMIN);
    adminToken = (
      await issuer.issueAccessToken({ userId: admin, role: Role.ADMIN, sessionId: randomUUID() })
    ).token;
  });

  afterAll(async () => {
    await testApp?.close();
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('CA-1: la ficha da plan, usado y vencimiento; fijar un extra suma plan + extra hasta el final del día elegido', async () => {
    const expiresAt = endOfDay(guatemalaDay(10));
    const client = await aClientWith({ usedBytes: 1024n, expiresAt });
    const until = guatemalaDay(3);

    expect(limitsOf(await getLimits(client.id))).toEqual({
      status: 'active',
      planName: 'Pro',
      usedBytes: '1024',
      baseQuotaBytes: PRO_QUOTA.toString(),
      extraQuotaBytes: '0',
      extraQuotaUntil: null,
      totalQuotaBytes: PRO_QUOTA.toString(),
      expiresAt: expiresAt.toISOString(),
    });

    const adjusted = limitsOf(
      await putQuota(client.id, { extraBytes: FIVE_GIB.toString(), until }),
    );

    const expected = {
      extraQuotaBytes: FIVE_GIB.toString(),
      extraQuotaUntil: endOfDay(until).toISOString(),
      totalQuotaBytes: (PRO_QUOTA + FIVE_GIB).toString(),
    };
    expect(adjusted).toMatchObject(expected);
    expect(limitsOf(await getLimits(client.id))).toMatchObject(expected);
    expect(await eventsOf(client)).toEqual([
      {
        accion: 'account.quota_adjusted',
        rol_actor: 'ADMIN',
        atributos: { extraBytes: Number(FIVE_GIB), until: endOfDay(until).toISOString() },
      },
    ]);
  });

  it('RN-1: «hasta hoy» vale: el extra rige hasta el final del día de hoy en Guatemala', async () => {
    const client = await aClientWith();

    expect(
      limitsOf(await putQuota(client.id, { extraBytes: '1', until: guatemalaDay(0) })),
    ).toMatchObject({
      extraQuotaBytes: '1',
      extraQuotaUntil: endOfDay(guatemalaDay(0)).toISOString(),
    });
  });

  it('CA-4: cambiar, acortar y quitar el extra rige al momento, se audita y no borra archivos', async () => {
    const client = await aClientWith({ usedBytes: PRO_QUOTA });
    await runner.withActor(client, () =>
      insertFileWithVersion(context.requireActorScope(client), client.id),
    );
    await putQuota(client.id, { extraBytes: FIVE_GIB.toString(), until: guatemalaDay(10) });

    const shortened = limitsOf(
      await putQuota(client.id, { extraBytes: '1024', until: guatemalaDay(2) }),
    );
    const removed = limitsOf(await deleteQuota(client.id));

    expect(shortened).toMatchObject({
      extraQuotaBytes: '1024',
      extraQuotaUntil: endOfDay(guatemalaDay(2)).toISOString(),
    });
    expect(removed).toMatchObject({
      extraQuotaBytes: '0',
      extraQuotaUntil: null,
      totalQuotaBytes: PRO_QUOTA.toString(),
    });
    expect(await filesOf(client)).toBe(1);
    expect((await eventsOf(client)).map((event) => event.atributos)).toEqual([
      { extraBytes: Number(FIVE_GIB), until: endOfDay(guatemalaDay(10)).toISOString() },
      { extraBytes: 1024, until: endOfDay(guatemalaDay(2)).toISOString() },
      { extraBytes: 0 },
    ]);
  });

  it('CA-2: `plan + extra < usado` es `422 BACKOFFICE_QUOTA_BELOW_USAGE` con el usado y el total resultante; nada cambia', async () => {
    const used = PRO_QUOTA + FIVE_GIB + 1n;
    const client = await aClientWith({ usedBytes: used });
    const before = await storedOf(client);

    const body = errorOf(
      await putQuota(client.id, { extraBytes: FIVE_GIB.toString(), until: guatemalaDay(3) }),
      422,
    );

    expect(body).toMatchObject({
      code: BACKOFFICE_ERROR_CODES.QUOTA_BELOW_USAGE,
      details: { usedBytes: used.toString(), totalQuotaBytes: (PRO_QUOTA + FIVE_GIB).toString() },
    });
    expect(await storedOf(client)).toEqual(before);
    expect(await eventsOf(client)).toEqual([]);
  });

  it('CA-2: el borde `plan + extra = usado` se acepta; quitar el extra con el plan bajo lo usado, no', async () => {
    const client = await aClientWith({ usedBytes: PRO_QUOTA + FIVE_GIB });

    limitsOf(
      await putQuota(client.id, { extraBytes: FIVE_GIB.toString(), until: guatemalaDay(3) }),
    );
    const before = await storedOf(client);

    expect(errorOf(await deleteQuota(client.id), 422).code).toBe(
      BACKOFFICE_ERROR_CODES.QUOTA_BELOW_USAGE,
    );
    expect(await storedOf(client)).toEqual(before);
    expect(await eventsOf(client)).toHaveLength(1);
  });

  it.each([
    ['un extra de cero', { extraBytes: '0', until: guatemalaDay(3) }, 'INVALID_EXTRA_BYTES'],
    ['un día que no existe', { extraBytes: '1024', until: '2026-02-30' }, 'INVALID_DAY'],
  ])(
    'CA-3: %s es `422 BACKOFFICE_QUOTA_INVALID` con `fields` y nada cambia',
    async (_case, payload, reason) => {
      const client = await aClientWith();
      const before = await storedOf(client);

      const body = errorOf(await putQuota(client.id, payload), 422);

      expect(body.code).toBe(BACKOFFICE_ERROR_CODES.QUOTA_INVALID);
      expect(body.fields?.map((field) => field.reason)).toEqual([reason]);
      expect(await storedOf(client)).toEqual(before);
      expect(await eventsOf(client)).toEqual([]);
    },
  );

  it.each([
    ['una fecha pasada', () => ({ extraBytes: '1024', until: guatemalaDay(-1) })],
    [
      'un total mayor que 2^53-1',
      () => ({
        extraBytes: (BigInt(Number.MAX_SAFE_INTEGER) - PRO_QUOTA + 1n).toString(),
        until: guatemalaDay(3),
      }),
    ],
  ])('CA-3: %s es `422 BACKOFFICE_QUOTA_INVALID` y nada cambia', async (_case, payload) => {
    const client = await aClientWith();
    const before = await storedOf(client);

    expect(errorOf(await putQuota(client.id, payload()), 422).code).toBe(
      BACKOFFICE_ERROR_CODES.QUOTA_INVALID,
    );
    expect(await storedOf(client)).toEqual(before);
    expect(await eventsOf(client)).toEqual([]);
  });

  it('CA-3: sin suscripción, la ficha es `status: none` y ajustar o quitar es `422 BACKOFFICE_QUOTA_INVALID`', async () => {
    const client = await newClient();

    expect(limitsOf(await getLimits(client.id))).toEqual({
      status: 'none',
      planName: null,
      usedBytes: '0',
      baseQuotaBytes: null,
      extraQuotaBytes: '0',
      extraQuotaUntil: null,
      totalQuotaBytes: null,
      expiresAt: null,
    });
    expect(
      errorOf(await putQuota(client.id, { extraBytes: '1024', until: guatemalaDay(3) }), 422).code,
    ).toBe(BACKOFFICE_ERROR_CODES.QUOTA_INVALID);
    expect(errorOf(await deleteQuota(client.id), 422).code).toBe(
      BACKOFFICE_ERROR_CODES.QUOTA_INVALID,
    );
    expect(await eventsOf(client)).toEqual([]);
  });

  it.each([
    ['una cuenta interna', async () => insertAccount(owner, Role.SUPPORT)],
    ['una cuenta inexistente', () => Promise.resolve(randomUUID())],
    ['un `:id` que no es UUID', () => Promise.resolve('no-es-un-uuid')],
  ])('CA-3: %s es `404 IDENTITY_ACCOUNT_NOT_FOUND` en las tres rutas', async (_case, idOf) => {
    const id = await idOf();
    const payload = { extraBytes: '1024', until: guatemalaDay(3) };

    for (const response of [
      await getLimits(id),
      await putQuota(id, payload),
      await deleteQuota(id),
    ]) {
      expect(errorOf(response, 404).code).toBe(IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND);
    }
  });

  it('RN-6, HU-5: Personal no vence y también admite un extra; una cuenta en solo lectura se ve `readOnly`', async () => {
    const personal = await aClientWith({ planId: PERSONAL_PLAN_ID, expiresAt: null });
    const readOnly = await aClientWith({
      expiresAt: new Date(Date.now() - DAY_MS),
      readOnly: true,
    });

    expect(limitsOf(await getLimits(personal.id))).toMatchObject({
      status: 'personal',
      planName: 'Personal',
      expiresAt: null,
    });
    expect(
      limitsOf(await putQuota(personal.id, { extraBytes: '1024', until: guatemalaDay(3) })),
    ).toMatchObject({ status: 'personal', extraQuotaBytes: '1024' });
    expect(limitsOf(await getLimits(readOnly.id)).status).toBe('readOnly');
  });
});
