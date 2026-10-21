import { FixedClock } from '../../../../shared';
import { PlanAlreadyDeactivatedError } from '../errors/plan-already-deactivated.error';
import { PlanInvalidError } from '../errors/plan-invalid.error';
import { PlanNotDeactivatableError } from '../errors/plan-not-deactivatable.error';
import { MAX_FILE_BYTES_CEILING } from '../plan-rules';

import { Plan } from './plan.entity';
import type { NewPlan } from './plan.entity';

const ID = '20000000-0000-4000-8000-000000000001';
const NOW = new FixedClock(new Date('2026-10-14T12:00:00.000Z')).now();

const command = (
  patch: Partial<NewPlan> = {},
  limits: Partial<NewPlan['limits']> = {},
): NewPlan => ({
  name: 'Pro Anual',
  description: 'Pro con descuento',
  priceCents: 45_000,
  ...patch,
  limits: {
    quotaBytes: 107_374_182_400n,
    maxFileBytes: 524_288_000n,
    maxEditors: 3,
    agentQueriesPerMonth: 500,
    retainedVersions: 30,
    trashRetentionDays: 30,
    ...limits,
  },
});

const issuesOf = (work: () => unknown): { field: string; reason: string }[] => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(PlanInvalidError);
    return (
      (error as PlanInvalidError).fields?.map(({ field, reason }) => ({ field, reason })) ?? []
    );
  }
  throw new Error('se esperaba PlanInvalidError');
};

describe('Plan (spec 011 CA-9 a CA-11, RN-4)', () => {
  it('CA-9: un plan nuevo queda activo, con el nombre recortado y el slug derivado', () => {
    const plan = Plan.create(ID, command({ name: '  Pro Anual ' }));

    expect(plan).toMatchObject({
      id: ID,
      name: 'Pro Anual',
      slug: 'pro-anual',
      deactivatedAt: null,
    });
    expect(plan.isActive).toBe(true);
  });

  it('CA-11: editores admite 0', () => {
    expect(Plan.create(ID, command({}, { maxEditors: 0 })).limits.maxEditors).toBe(0);
  });

  it('CA-11: precio negativo, nombre vacío y límites no positivos son 422 con cada campo', () => {
    const issues = issuesOf(() =>
      Plan.create(
        ID,
        command(
          { name: '   ', priceCents: -1 },
          {
            quotaBytes: 0n,
            agentQueriesPerMonth: 0,
            retainedVersions: 0,
            trashRetentionDays: 0,
            maxEditors: -1,
          },
        ),
      ),
    );

    expect(issues).toEqual([
      { field: 'name', reason: 'REQUIRED' },
      { field: 'priceCents', reason: 'NEGATIVE' },
      { field: 'quotaBytes', reason: 'NOT_POSITIVE' },
      { field: 'maxEditors', reason: 'NEGATIVE' },
      { field: 'agentQueriesPerMonth', reason: 'NOT_POSITIVE' },
      { field: 'retainedVersions', reason: 'NOT_POSITIVE' },
      { field: 'trashRetentionDays', reason: 'NOT_POSITIVE' },
    ]);
  });

  it('CA-11, RNF-02: el máximo por archivo no supera la cuota ni 2 GB', () => {
    expect(
      issuesOf(() => Plan.create(ID, command({}, { quotaBytes: 100n, maxFileBytes: 101n }))),
    ).toEqual([{ field: 'maxFileBytes', reason: 'EXCEEDS_QUOTA' }]);
    expect(
      issuesOf(() =>
        Plan.create(
          ID,
          command(
            {},
            { quotaBytes: MAX_FILE_BYTES_CEILING * 2n, maxFileBytes: MAX_FILE_BYTES_CEILING + 1n },
          ),
        ),
      ),
    ).toEqual([{ field: 'maxFileBytes', reason: 'EXCEEDS_CEILING' }]);
  });

  it('CA-10: desactivar un plan activo guarda la fecha y lo deja inactivo', () => {
    const deactivated = Plan.create(ID, command()).deactivate(NOW);

    expect(deactivated.deactivatedAt).toEqual(NOW);
    expect(deactivated.isActive).toBe(false);
  });

  it('011 CA-8: Personal es el plan por omisión; los demás, no', () => {
    expect(Plan.create(ID, command({ name: 'Personal' })).isDefault).toBe(true);
    expect(Plan.create(ID, command()).isDefault).toBe(false);
  });

  it('CA-11: Personal no se desactiva', () => {
    const personal = Plan.create(ID, command({ name: 'Personal' }));

    expect(() => personal.deactivate(NOW)).toThrow(PlanNotDeactivatableError);
  });

  it('CA-10: un plan ya desactivado no se vuelve a desactivar (no hay reactivación)', () => {
    const deactivated = Plan.create(ID, command()).deactivate(NOW);

    expect(() => deactivated.deactivate(NOW)).toThrow(PlanAlreadyDeactivatedError);
  });
});
