import type { PlanCatalogService } from '../application/plan-catalog.service';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanDomain } from '../domain/plan-catalog';

import { PlansController } from './plans.controller';

describe('PlansController', () => {
  let controller: PlansController;
  let service: jest.Mocked<Pick<PlanCatalogService, 'list'>>;

  const personal: PlanDomain = {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'personal',
    nombre: 'Personal',
    descripcion: 'Para uso individual',
    precioCentavos: 0,
    cuotaBytes: 16106127360n,
    maxArchivoBytes: 52428800n,
    maxEditores: 0,
    consultasAgenteMensual: 20,
    versionesRetenidas: 5,
    diasRetencionPapelera: 7,
  };

  beforeEach(() => {
    service = { list: jest.fn() };
    controller = new PlansController(service as unknown as PlanCatalogService);
  });

  it('CA-1: devuelve { planes } con el precio entero y los bytes como cadena decimal', async () => {
    service.list.mockResolvedValue([personal]);

    const result = await controller.getPlans();

    // toEqual ya verifica los tipos: precioCentavos número, bytes cadena
    expect(result).toEqual({
      planes: [
        {
          id: personal.id,
          slug: 'personal',
          nombre: 'Personal',
          descripcion: 'Para uso individual',
          precioCentavos: 0,
          cuotaBytes: '16106127360',
          maxArchivoBytes: '52428800',
          maxEditores: 0,
          consultasAgenteMensual: 20,
          versionesRetenidas: 5,
          diasRetencionPapelera: 7,
        },
      ],
    });
  });

  it('CA-1: conserva el orden que entrega el servicio', async () => {
    const pro: PlanDomain = {
      ...personal,
      id: '10000000-0000-4000-8000-000000000002',
      slug: 'pro',
      nombre: 'Pro',
      precioCentavos: 4500,
      cuotaBytes: 107374182400n,
      maxArchivoBytes: 524288000n,
      maxEditores: 5,
    };
    service.list.mockResolvedValue([personal, pro]);

    const result = await controller.getPlans();

    expect(result.planes.map((p) => p.slug)).toEqual(['personal', 'pro']);
    expect(result.planes.map((p) => p.precioCentavos)).toEqual([0, 4500]);
  });

  it('CA-1: con el catálogo vacío responde { planes: [] }', async () => {
    service.list.mockResolvedValue([]);

    await expect(controller.getPlans()).resolves.toEqual({ planes: [] });
  });

  it('CA-1: entrega una descripción nula y un slug fuera de la semilla tal como vienen de la tabla', async () => {
    service.list.mockResolvedValue([{ ...personal, slug: 'empresarial', descripcion: null }]);

    const result = await controller.getPlans();

    expect(result.planes[0]).toMatchObject({ slug: 'empresarial', descripcion: null });
  });

  it('CA-3: propaga PlanCatalogUnavailableError sin transformarlo', async () => {
    service.list.mockRejectedValue(new PlanCatalogUnavailableError());

    await expect(controller.getPlans()).rejects.toBeInstanceOf(PlanCatalogUnavailableError);
  });
});
