import { planChangeMessage } from './plan-change-result';

const RESULT = {
  kind: 'SCHEDULED_FOR_NEXT_BILLING' as const,
  planSlug: 'pro',
  planName: 'Pro',
  effectiveAt: '2026-10-14T18:00:00.000Z',
};

describe('planChangeMessage: el cambio de plan es un éxito con su fecha', () => {
  it('programado para la próxima fecha de cobro: el día en dd/mm/aaaa de Guatemala', () => {
    const before = Date.parse('2026-10-01T00:00:00.000Z');

    expect(planChangeMessage(RESULT, before)).toBe(
      'Tu plan cambiará a Pro el 14/10/2026, en tu próxima fecha de cobro.',
    );
  });

  it('si ya rige (Personal en solo lectura, 010 CA-27), dice que cambió', () => {
    const after = Date.parse('2026-10-14T18:00:01.000Z');

    expect(planChangeMessage({ ...RESULT, planName: 'Personal' }, after)).toBe(
      'Tu plan cambió a Personal.',
    );
  });
});
