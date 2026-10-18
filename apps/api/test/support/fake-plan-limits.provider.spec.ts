import { createActor, Role } from '../../src/shared';

import { FakePlanLimitsProvider } from './fake-plan-limits.provider';

describe('FakePlanLimitsProvider', () => {
  const actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

  it('CA-3, CA-4: devuelve los límites que la prueba le pasa', async () => {
    const provider = new FakePlanLimitsProvider({
      maxFileBytes: 10n,
      storageQuotaBytes: 100n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
      planName: 'Plan de prueba',
    });

    await expect(provider.limitsFor(actor)).resolves.toEqual({
      maxFileBytes: 10n,
      storageQuotaBytes: 100n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
      planName: 'Plan de prueba',
    });
  });

  it('CA-3, CA-4: los límites se pueden cambiar entre casos', async () => {
    const provider = new FakePlanLimitsProvider({
      maxFileBytes: 10n,
      storageQuotaBytes: 100n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
      planName: 'Plan de prueba',
    });

    provider.setLimits({
      planName: 'Plan de prueba',
      maxFileBytes: 1n,
      storageQuotaBytes: 2n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
    });

    await expect(provider.limitsFor(actor)).resolves.toEqual({
      maxFileBytes: 1n,
      storageQuotaBytes: 2n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
      planName: 'Plan de prueba',
    });
  });

  it('CA-3: registra a qué actores consultó', async () => {
    const provider = new FakePlanLimitsProvider({
      maxFileBytes: 1n,
      storageQuotaBytes: 1n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
      planName: 'Plan de prueba',
    });

    await provider.limitsFor(actor);

    expect(provider.requestedFor).toEqual([actor.id]);
  });
});
