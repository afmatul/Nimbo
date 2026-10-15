import type { PlanCatalogService } from '../application/plan-catalog.service';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanSummary } from '../domain/plan-summary';

import { PlansController } from './plans.controller';

describe('PlansController', () => {
  let controller: PlansController;
  let service: jest.Mocked<Pick<PlanCatalogService, 'list'>>;

  const personal: PlanSummary = {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'personal',
    name: 'Personal',
    description: 'Para uso individual',
    priceCents: 0,
    quotaBytes: 16106127360n,
    maxFileBytes: 52428800n,
    maxEditors: 0,
    agentQueriesPerMonth: 20,
    retainedVersions: 5,
    trashRetentionDays: 7,
  };

  beforeEach(() => {
    service = { list: jest.fn() };
    controller = new PlansController(service as unknown as PlanCatalogService);
  });

  it('CA-1: devuelve { plans } con el precio entero y los bytes como cadena decimal', async () => {
    service.list.mockResolvedValue([personal]);

    const result = await controller.getPlans();

    // toEqual ya verifica los tipos: priceCents número, bytes cadena
    expect(result).toEqual({
      plans: [
        {
          id: personal.id,
          slug: 'personal',
          name: 'Personal',
          description: 'Para uso individual',
          priceCents: 0,
          quotaBytes: '16106127360',
          maxFileBytes: '52428800',
          maxEditors: 0,
          agentQueriesPerMonth: 20,
          retainedVersions: 5,
          trashRetentionDays: 7,
        },
      ],
    });
  });

  it('CA-1: conserva el orden que entrega el servicio', async () => {
    const pro: PlanSummary = {
      ...personal,
      id: '10000000-0000-4000-8000-000000000002',
      slug: 'pro',
      name: 'Pro',
      priceCents: 4500,
      quotaBytes: 107374182400n,
      maxFileBytes: 524288000n,
      maxEditors: 5,
    };
    service.list.mockResolvedValue([personal, pro]);

    const result = await controller.getPlans();

    expect(result.plans.map((p) => p.slug)).toEqual(['personal', 'pro']);
    expect(result.plans.map((p) => p.priceCents)).toEqual([0, 4500]);
  });

  it('CA-1: con el catálogo vacío responde { plans: [] }', async () => {
    service.list.mockResolvedValue([]);

    await expect(controller.getPlans()).resolves.toEqual({ plans: [] });
  });

  it('CA-1: entrega una descripción nula y un slug fuera de la semilla tal como vienen de la tabla', async () => {
    service.list.mockResolvedValue([{ ...personal, slug: 'empresarial', description: null }]);

    const result = await controller.getPlans();

    expect(result.plans[0]).toMatchObject({ slug: 'empresarial', description: null });
  });

  it('CA-3: propaga PlanCatalogUnavailableError sin transformarlo', async () => {
    service.list.mockRejectedValue(new PlanCatalogUnavailableError(new Error('db down')));

    await expect(controller.getPlans()).rejects.toBeInstanceOf(PlanCatalogUnavailableError);
  });
});
