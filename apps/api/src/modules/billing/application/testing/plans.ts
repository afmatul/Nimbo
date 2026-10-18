import { Plan } from '../../domain/entities/plan.entity';
import type { PlanProps } from '../../domain/entities/plan.entity';

/** Personal de la semilla de 006a, para las pruebas de unidad de `billing`. */
export const PERSONAL_PLAN: Plan = Plan.rehydrate({
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: 'Para uso individual',
  priceCents: 0,
  limits: {
    quotaBytes: 16_106_127_360n,
    maxFileBytes: 52_428_800n,
    maxEditors: 0,
    agentQueriesPerMonth: 20,
    retainedVersions: 3,
    trashRetentionDays: 7,
  },
  deactivatedAt: null,
});

/** Un plan de prueba a partir de Personal con los cambios de `patch`. */
export const aPlan = (patch: Partial<PlanProps>): Plan =>
  Plan.rehydrate({ ...PERSONAL_PLAN, ...patch });
