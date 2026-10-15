import { planCatalogResponseSchema } from './schemas';

const proPlan = {
  id: '00000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  description: null,
  priceCents: 4500,
  quotaBytes: '214748364800',
  maxFileBytes: '1073741824',
  maxEditors: 3,
  agentQueriesPerMonth: 300,
  retainedVersions: 30,
  trashRetentionDays: 30,
};

describe('planCatalogResponseSchema', () => {
  it('CA-1: acepta un plan con descripción nula y bytes como texto decimal', () => {
    expect(planCatalogResponseSchema.parse({ plans: [proPlan] })).toEqual({ plans: [proPlan] });
  });

  it('CA-1: rechaza bytes como número (ADR-0016)', () => {
    const result = planCatalogResponseSchema.safeParse({
      plans: [{ ...proPlan, quotaBytes: 214748364800 }],
    });

    expect(result.success).toBe(false);
  });

  it('CA-1: rechaza un precio con decimales (centavos enteros)', () => {
    const result = planCatalogResponseSchema.safeParse({
      plans: [{ ...proPlan, priceCents: 45.5 }],
    });

    expect(result.success).toBe(false);
  });
});
