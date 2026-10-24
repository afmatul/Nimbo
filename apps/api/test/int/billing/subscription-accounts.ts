import { randomUUID } from 'node:crypto';

import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { FixedClock, Role } from '../../../src/shared';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { TestApp } from '../setup/test-app';
import { insertAccount } from '../storage/storage-test-db';

export const PERSONAL_ID = '10000000-0000-4000-8000-000000000001';
export const PRO_ID = '10000000-0000-4000-8000-000000000002';
export const TEAM_ID = '10000000-0000-4000-8000-000000000003';
export const DAY_MS = 86_400_000;
export const PERIOD_MS = 30 * DAY_MS;

/** Una fecha a `days` días de ahora (el `api` de las pruebas usa el reloj real). */
export const inDays = (days: number): Date => new Date(Date.now() + days * DAY_MS);

/** La suscripción de Equipo que se le arma a la cuenta; sin ella, Personal. */
export interface PaidRow {
  readonly expiresAt: Date;
  readonly readOnly?: boolean;
  readonly pendingPlanId?: string;
  readonly autoRenew?: boolean;
}

export interface SubscriptionRow {
  readonly plan_id: string;
  readonly iniciado_en: Date;
  readonly vence_en: Date | null;
  readonly estado: string;
  readonly renovacion_automatica: boolean;
  readonly plan_pendiente_id: string | null;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/** Una cuenta de prueba y su cliente HTTP: rutas relativas van a `/api/v1/billing/…`; con `/` inicial, a `/api/v1/…`. */
export interface SubscriptionAccount {
  readonly id: string;
  call(method: HttpMethod, path: string, payload?: object): Promise<Response>;
}

const rowValues = (id: string, paid: PaidRow | null): unknown[] =>
  paid === null
    ? [id, PERSONAL_ID, new Date(), null, 'vigente', null, true]
    : [
        id,
        TEAM_ID,
        new Date(paid.expiresAt.getTime() - PERIOD_MS),
        paid.expiresAt,
        paid.readOnly === true ? 'solo_lectura' : 'vigente',
        paid.pendingPlanId ?? null,
        paid.autoRenew ?? true,
      ];

/**
 * Cuentas de cliente con su suscripción escrita como dueño de las tablas y un cliente HTTP con su token (spec 010:
 * `renew` y los ajustes de la suscripción). `accounts` acumula los ids para `removeBillingAccounts`.
 */
export const subscriptionAccounts = (
  app: () => TestApp,
  owner: () => DataSource,
  accounts: string[],
): ((paid: PaidRow | null) => Promise<SubscriptionAccount>) => {
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));
  return async (paid: PaidRow | null) => {
    const id = await insertAccount(owner());
    accounts.push(id);
    await owner().query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en, estado, plan_pendiente_id,
                                renovacion_automatica)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      rowValues(id, paid),
    );
    const token = tokens.valid({ userId: id, role: Role.CLIENT, sessionId: randomUUID() });
    const call = (method: HttpMethod, path: string, payload?: object): Promise<Response> =>
      request(app().app.getHttpServer())
        [method](path.startsWith('/') ? `/api/v1${path}` : `/api/v1/billing/${path}`)
        .set({ Authorization: `Bearer ${token}` })
        .send(payload) as unknown as Promise<Response>;
    return { id, call };
  };
};

export const subscriptionOf = async (
  owner: DataSource,
  userId: string,
): Promise<SubscriptionRow> => {
  const [row] = (await owner.query(
    `SELECT plan_id, iniciado_en, vence_en, estado, renovacion_automatica, plan_pendiente_id
       FROM suscripcion WHERE usuario_id = $1`,
    [userId],
  )) as SubscriptionRow[];
  if (row === undefined) throw new Error('sin suscripción');
  return row;
};

export const countOf = async (
  owner: DataSource,
  table: 'transaccion' | 'factura',
  userId: string,
): Promise<number> => {
  const [row] = (await owner.query(
    `SELECT count(*)::int AS total FROM ${table} WHERE usuario_id = $1`,
    [userId],
  )) as { total: number }[];
  return row?.total ?? 0;
};

/** Los eventos `subscription.*` de la cuenta, en orden (CA-6, CA-22). */
export const subscriptionAuditsOf = async (
  owner: DataSource,
  userId: string,
): Promise<{ accion: string; atributos: object }[]> =>
  (await owner.query(
    `SELECT accion, atributos FROM evento_auditoria
      WHERE usuario_afectado_id = $1 AND accion LIKE 'subscription.%' ORDER BY ocurrido_en, id`,
    [userId],
  )) as { accion: string; atributos: object }[];

/** CA-29: una copia desactivada de Pro con nombre único, para programarla y ver que se descarta. */
export const insertRetiredPlan = async (
  owner: DataSource,
): Promise<{ readonly id: string; readonly nombre: string }> => {
  const [retired] = (await owner.query(
    `INSERT INTO plan (slug, nombre, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
                       consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera, desactivado_en)
     SELECT 'retirado-' || substr(md5(random()::text), 1, 8), 'Retirado ' || substr(md5(random()::text), 1, 6),
            descripcion, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores, consultas_agente_mensual,
            versiones_retenidas, dias_retencion_papelera, now()
       FROM plan WHERE id = $1 RETURNING id, nombre`,
    [PRO_ID],
  )) as { id: string; nombre: string }[];
  if (retired === undefined) throw new Error('sin plan retirado');
  return retired;
};

/** Quita el plan de `insertRetiredPlan` y lo que lo programaba. */
export const removeRetiredPlan = async (owner: DataSource, planId: string): Promise<void> => {
  await owner.query(
    'UPDATE suscripcion SET plan_pendiente_id = NULL WHERE plan_pendiente_id = $1',
    [planId],
  );
  await owner.query('DELETE FROM plan WHERE id = $1', [planId]);
};
