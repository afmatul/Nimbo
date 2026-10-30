import { aSubscription } from '../application/testing/subscriptions';

import { agentUsagePeriod } from './agent-usage-period';
import { PAID_PLAN_PERIOD_DAYS } from './entities/subscription.entity';

const DAY_MS = 86_400_000;
const TEAM_PLAN = { planId: '10000000-0000-4000-8000-000000000003', planSlug: 'equipo' };
const PAID_START = new Date('2026-10-14T12:00:00.000Z');
const PAID_END = new Date(PAID_START.getTime() + PAID_PLAN_PERIOD_DAYS * DAY_MS);
const NOW = new Date('2026-10-25T15:00:00.000Z');

const paid = (patch: Parameters<typeof aSubscription>[0] = {}) =>
  aSubscription({ ...TEAM_PLAN, startedAt: PAID_START, expiresAt: PAID_END, ...patch });

describe('agentUsagePeriod (spec 020 RN-4, CA-13, CA-14; DF-25)', () => {
  it('CA-13: un plan de pago vigente cuenta en el periodo de la suscripción', () => {
    expect(agentUsagePeriod(paid(), NOW)).toEqual({ startsAt: PAID_START, resetsAt: PAID_END });
  });

  it('CA-13: con el siguiente periodo ya pagado, el actual empieza 30 días antes de `startedAt`', () => {
    const nextStart = new Date('2026-11-13T12:00:00.000Z');
    const prepaid = paid({
      startedAt: nextStart,
      expiresAt: new Date(nextStart.getTime() + PAID_PLAN_PERIOD_DAYS * DAY_MS),
    });

    expect(agentUsagePeriod(prepaid, NOW)).toEqual({
      startsAt: new Date(nextStart.getTime() - PAID_PLAN_PERIOD_DAYS * DAY_MS),
      resetsAt: nextStart,
    });
  });

  it('CA-14: en solo lectura sigue el periodo vencido y no se reinicia hasta pagar (`resetsAt` nulo)', () => {
    const readOnly = paid({ status: 'solo_lectura' });

    expect(agentUsagePeriod(readOnly, new Date('2026-12-01T00:00:00.000Z'))).toEqual({
      startsAt: PAID_START,
      resetsAt: null,
    });
  });

  it('RN-4: Personal cuenta por mes calendario de Guatemala (UTC-6)', () => {
    expect(agentUsagePeriod(aSubscription(), NOW)).toEqual({
      startsAt: new Date('2026-10-01T06:00:00.000Z'),
      resetsAt: new Date('2026-11-01T06:00:00.000Z'),
    });
  });

  it('RN-4: sin fila de suscripción, también el mes de Guatemala', () => {
    expect(agentUsagePeriod(null, NOW).startsAt).toEqual(new Date('2026-10-01T06:00:00.000Z'));
  });

  it.each([
    ['2026-11-01T05:59:59.999Z', '2026-10-01T06:00:00.000Z', '2026-11-01T06:00:00.000Z'],
    ['2026-11-01T06:00:00.000Z', '2026-11-01T06:00:00.000Z', '2026-12-01T06:00:00.000Z'],
    ['2026-12-31T23:00:00.000Z', '2026-12-01T06:00:00.000Z', '2027-01-01T06:00:00.000Z'],
  ])('CA-13: en %s (hora UTC) el periodo de Personal es [%s, %s)', (now, startsAt, resetsAt) => {
    expect(agentUsagePeriod(null, new Date(now))).toEqual({
      startsAt: new Date(startsAt),
      resetsAt: new Date(resetsAt),
    });
  });
});
