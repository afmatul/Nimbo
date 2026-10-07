import { Test, TestingModule } from '@nestjs/testing';
import { PlanCatalogService } from './plan-catalog.service';
import { IPlanRepository } from './i-plan-repository';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import { PlanDomain } from '../domain/plan-catalog';

describe('PlanCatalogService', () => {
  let service: PlanCatalogService;
  let repositoryMock: jest.Mocked<IPlanRepository>;

  const mockPlans: PlanDomain[] = [
    {
      id: '1',
      slug: 'personal',
      nombre: 'Personal',
      descripcion: 'Plan personal',
      precioCentavos: 0,
      cuotaBytes: 1000n,
      maxArchivoBytes: 500n,
      maxEditores: 0,
      consultasAgenteMensual: 10,
      versionesRetenidas: 5,
      diasRetencionPapelera: 30,
    },
    {
      id: '2',
      slug: 'pro',
      nombre: 'Pro',
      descripcion: 'Plan pro',
      precioCentavos: 4500,
      cuotaBytes: 5000n,
      maxArchivoBytes: 2000n,
      maxEditores: 3,
      consultasAgenteMensual: 100,
      versionesRetenidas: 30,
      diasRetencionPapelera: 60,
    },
  ];

  beforeEach(async () => {
    repositoryMock = {
      listAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanCatalogService,
        {
          provide: IPlanRepository,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<PlanCatalogService>(PlanCatalogService);
  });

  it('debe listar los planes correctamente', async () => {
    repositoryMock.listAll.mockResolvedValue(mockPlans);

    const result = await service.list();

    expect(result).toEqual(mockPlans);
    expect(repositoryMock.listAll).toHaveBeenCalledTimes(1);
  });

  it('debe retornar lista vacía si no hay planes', async () => {
    repositoryMock.listAll.mockResolvedValue([]);

    const result = await service.list();

    expect(result).toEqual([]);
  });

  it('debe lanzar PlanCatalogUnavailableError si falla la lectura del repositorio', async () => {
    repositoryMock.listAll.mockRejectedValue(new Error('DB Error'));

    await expect(service.list()).rejects.toThrow(PlanCatalogUnavailableError);
  });
});