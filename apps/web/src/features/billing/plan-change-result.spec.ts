import type { PlanChangeResponse } from '@nimbo/contracts';

import { planChangeMessage } from './plan-change-result';

const RESULT: PlanChangeResponse['result'] = {
  kind: 'SCHEDULED_FOR_NEXT_BILLING',
  planSlug: 'pro',
  planName: 'Pro',
  effectiveAt: '2026-10-14T18:00:00.000Z',
};

describe('planChangeMessage: el mensaje sale del `kind` del resultado, no de las fechas', () => {
  it('SCHEDULED_FOR_NEXT_BILLING: el plan y el día en dd/mm/aaaa de Guatemala', () => {
    expect(planChangeMessage(RESULT)).toBe(
      'Tu plan cambiará a Pro el 14/10/2026, en tu próxima fecha de cobro.',
    );
  });

  it('SCHEDULED_FOR_NEXT_BILLING: aunque `effectiveAt` ya haya pasado, sigue siendo programado', () => {
    const past = { ...RESULT, effectiveAt: '2020-01-05T18:00:00.000Z' };

    expect(planChangeMessage(past)).toBe(
      'Tu plan cambiará a Pro el 05/01/2020, en tu próxima fecha de cobro.',
    );
  });

  it('APPLIED_IMMEDIATELY (Personal en solo lectura, 010 CA-27): dice que cambió, sin fecha', () => {
    const applied = {
      ...RESULT,
      kind: 'APPLIED_IMMEDIATELY' as const,
      planSlug: 'personal',
      planName: 'Personal',
      effectiveAt: '2099-10-14T18:00:00.000Z',
    };

    expect(planChangeMessage(applied)).toBe('Tu plan cambió a Personal.');
  });
});
