import { createActor, Role } from '../../../shared';
import { AccountReadOnlyError } from '../domain/errors';

import type { IPlanLimitsProvider } from './plan-limits';
import { assertWritableLimits, WritableAccountPolicy } from './writable-account.policy';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

const policyWith = (readOnly: boolean) => {
  const plans = {
    limitsFor: jest.fn().mockResolvedValue({ readOnly }),
  } as unknown as IPlanLimitsProvider;
  return { policy: new WritableAccountPolicy(plans), plans };
};

describe('WritableAccountPolicy (spec 010 CA-13, RN-6; ADR-0032)', () => {
  it('CA-13: en solo lectura es 403 STORAGE_ACCOUNT_READ_ONLY con el mensaje de la spec', async () => {
    const { policy, plans } = policyWith(true);

    await expect(policy.assertWritable(ANA)).rejects.toMatchObject({
      constructor: AccountReadOnlyError,
      status: 403,
      code: 'STORAGE_ACCOUNT_READ_ONLY',
      message:
        'Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir, editar y compartir.',
    });
    expect(plans.limitsFor).toHaveBeenCalledWith(ANA);
  });

  it('CA-10: vigente, deja escribir', async () => {
    await expect(policyWith(false).policy.assertWritable(ANA)).resolves.toBeUndefined();
  });

  it('ADR-0032 regla 2: con los límites ya leídos no vuelve a consultar', () => {
    expect(() => assertWritableLimits({ readOnly: true })).toThrow(AccountReadOnlyError);
    expect(() => assertWritableLimits({ readOnly: false })).not.toThrow();
  });
});
