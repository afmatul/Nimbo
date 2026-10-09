import { PlanCatalogResponseSchema } from '@nimbo/contracts';
import type { PlanCatalogResponse } from '@nimbo/contracts';
import request from 'supertest';

import { BillingModule } from '../../../src/modules/billing';
import { I_CLOCK, Role } from '../../../src/shared';
import type { FixedClock } from '../../../src/shared';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp, type TestApp } from '../setup/test-app';

const PLANS_PATH = '/api/v1/billing/plans';

/** Semilla de la 006a (RN-1): orden por precio ascendente, bytes como cadena decimal. */
const SEEDED_CATALOG = [
  { slug: 'personal', precioCentavos: 0, cuotaBytes: '16106127360', maxArchivoBytes: '52428800' },
  { slug: 'pro', precioCentavos: 4500, cuotaBytes: '107374182400', maxArchivoBytes: '524288000' },
  {
    slug: 'equipo',
    precioCentavos: 11000,
    cuotaBytes: '375809638400',
    maxArchivoBytes: '1073741824',
  },
  {
    slug: 'institucional',
    precioCentavos: 45000,
    cuotaBytes: '2199023255552',
    maxArchivoBytes: '2147483648',
  },
];

describe('GET /api/v1/billing/plans contra la semilla de la 006a (008 CA-1)', () => {
  let testApp: TestApp;
  let tokens: TestAccessTokens;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [BillingModule] });
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
    return PlanCatalogResponseSchema.parse(response.body);
  };

  it('CA-1: un visitante anónimo recibe los cuatro planes ordenados por precio con bytes como cadena', async () => {
    const { planes } = await fetchCatalog();

    expect(
      planes.map(({ slug, precioCentavos, cuotaBytes, maxArchivoBytes }) => ({
        slug,
        precioCentavos,
        cuotaBytes,
        maxArchivoBytes,
      })),
    ).toEqual(SEEDED_CATALOG);
  });

  it('CA-1: un cliente con sesión recibe el mismo catálogo que un anónimo', async () => {
    const anonymous = await fetchCatalog();
    const authenticated = await fetchCatalog(`Bearer ${tokens.forRole(Role.CLIENT)}`);

    expect(authenticated).toEqual(anonymous);
  });
});
