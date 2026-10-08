    import { Test, TestingModule } from '@nestjs/testing';
import { PlansController } from './plans.controller';
import { PlanCatalogService } from '../application/plan-catalog.service';

describe('PlansController', () => {
  let controller: PlansController;
  let service: PlanCatalogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlansController],
      providers: [
        {
          provide: PlanCatalogService,
          useValue: {
            list: jest.fn().mockResolvedValue([{ id: '1', slug: 'pro' }]),
          },
        },
      ],
    }).compile();

    controller = module.get<PlansController>(PlansController);
    service = module.get<PlanCatalogService>(PlanCatalogService);
  });

  it('debe retornar la lista de planes', async () => {
      const result = await controller.getPlans();
      expect(result).toEqual({
        planes: [
          {
            id: '1',
            slug: 'pro',
            cuotaBytes: '0',
            maxArchivoBytes: '0',
            precioCentavos: '0',
          },
        ],
      });
      expect(service.list).toHaveBeenCalled();
    });
});