import { PlanLimitsBindingModule } from '../plan-limits-binding.module';

import { DevPaidPlanBindingModule, planLimitsBinding } from './dev-paid-plan.module';
import { DevPaidPlanLimitsProvider } from './dev-paid-plan.provider';

describe('andamiaje temporal de plan de pago (016 RN-13, plan §2.1)', () => {
  it('RN-13: sin `DEV_FORCE_PAID_PLAN` la raíz usa el enlace real de límites', () => {
    expect(planLimitsBinding({ APP_ENV: 'local', DEV_FORCE_PAID_PLAN: undefined })).toBe(
      PlanLimitsBindingModule,
    );
  });

  it('RN-13: con `DEV_FORCE_PAID_PLAN` en local la raíz usa el andamiaje', () => {
    const binding = planLimitsBinding({ APP_ENV: 'local', DEV_FORCE_PAID_PLAN: 'pro' });

    expect(binding).toMatchObject({ module: DevPaidPlanBindingModule });
  });

  it.each(['staging', 'production'])(
    'RN-13: segunda barrera: con `APP_ENV=%s` no arranca',
    (appEnv) => {
      expect(() =>
        planLimitsBinding({ APP_ENV: appEnv as never, DEV_FORCE_PAID_PLAN: 'pro' }),
      ).toThrow(/no se admite fuera de local o test/);
    },
  );

  it('RN-13: todo actor recibe los límites del plan forzado, leídos de la tabla `plan`', async () => {
    const limits = { planName: 'Pro', maxEditors: 3 };
    const plans = { getLimitsBySlug: jest.fn().mockResolvedValue(limits) };
    const provider = new DevPaidPlanLimitsProvider(plans, 'pro');

    await expect(provider.limitsFor()).resolves.toBe(limits);
    expect(plans.getLimitsBySlug).toHaveBeenCalledWith('pro');
  });
});
