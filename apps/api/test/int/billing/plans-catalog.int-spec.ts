import { planCatalogResponseSchema } from '@nimbo/contracts';
import type { PlanCatalogResponse } from '@nimbo/contracts';
import request from 'supertest';

import { BillingHttpModule } from '../../../src/modules/billing';
import { I_CLOCK, Role } from '../../../src/shared';
import type { FixedClock } from '../../../src/shared';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp, type TestApp } from '../setup/test-app';

const PLANS_PATH = '/api/v1/billing/plans';

/** Semilla de la 006a (RN-1): orden por precio ascendente, bytes como cadena decimal. */
const SEEDED_CATALOG = [
  { slug: 'personal', priceCents: 0, quotaBytes: '16106127360', maxFileBytes: '52428800' },
  { slug: 'pro', priceCents: 4500, quotaBytes: '107374182400', maxFileBytes: '524288000' },
  {
    slug: 'equipo',
    priceCents: 11000,
    quotaBytes: '375809638400',
    maxFileBytes: '1073741824',
  },
  {
    slug: 'institucional',
    priceCents: 45000,
    quotaBytes: '2199023255552',
    maxFileBytes: '2147483648',
  },
];

describe('GET /api/v1/billing/plans contra la semilla de la 006a (008 CA-1)', () => {
  let testApp: TestApp;
  let tokens: TestAccessTokens;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [BillingHttpModule] });
    tokens = new TestAccessTokens(testApp.app.get<FixedClock>(I_CLOCK));
  });

  afterAll(async () => {
    await testApp?.close();
  });

  const fetchCatalog = async (authorization?: string): Promise<PlanCatalogResponse> => {
    const call = request(testApp.app.getHttpServer()).get(PLANS_PATH);
    const response = await (
      authorization === undefined ? call : call.set('Authorization', authorization)
    ).expect(200);
    return planCatalogResponseSchema.parse(response.body);
  };

  it('CA-1: un visitante anónimo recibe los cuatro planes ordenados por precio con bytes como cadena', async () => {
    const { plans } = await fetchCatalog();

    expect(
      plans.map(({ slug, priceCents, quotaBytes, maxFileBytes }) => ({
        slug,
        priceCents,
        quotaBytes,
        maxFileBytes,
      })),
    ).toEqual(SEEDED_CATALOG);
  });

  it('CA-1: un cliente con sesión recibe el mismo catálogo que un anónimo', async () => {
    const anonymous = await fetchCatalog();
    const authenticated = await fetchCatalog(`Bearer ${tokens.forRole(Role.CLIENT)}`);

    expect(authenticated).toEqual(anonymous);
  });
});
