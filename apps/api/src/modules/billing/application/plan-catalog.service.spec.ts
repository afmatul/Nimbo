import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';

import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanSummary } from '../domain/plan-summary';

import { I_PLAN_REPOSITORY } from './i-plan-repository';
import type { IPlanRepository } from './i-plan-repository';
import { PlanCatalogService } from './plan-catalog.service';

describe('PlanCatalogService', () => {
  let service: PlanCatalogService;
  let repositoryMock: jest.Mocked<IPlanRepository>;
  let loggerMock: { error: jest.Mock };

  const mockPlans: PlanSummary[] = [
    {
      id: '1',
      slug: 'personal',
      name: 'Personal',
      description: 'Plan personal',
      priceCents: 0,
      quotaBytes: 1000n,
      maxFileBytes: 500n,
      maxEditors: 0,
      agentQueriesPerMonth: 10,
      retainedVersions: 5,
      trashRetentionDays: 30,
    },
    {
      id: '2',
      slug: 'pro',
      name: 'Pro',
      description: 'Plan pro',
      priceCents: 4500,
      quotaBytes: 5000n,
      maxFileBytes: 2000n,
      maxEditors: 3,
      agentQueriesPerMonth: 100,
      retainedVersions: 30,
      trashRetentionDays: 60,
    },
  ];

  beforeEach(async () => {
    repositoryMock = {
      findAll: jest.fn(),
    } as unknown as jest.Mocked<IPlanRepository>;
    loggerMock = { error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanCatalogService,
        {
          provide: I_PLAN_REPOSITORY,
          useValue: repositoryMock,
        },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<PlanCatalogService>(PlanCatalogService);
  });

  it('CA-1: entrega los planes en el orden del repositorio', async () => {
    repositoryMock.findAll.mockResolvedValue(mockPlans);

    const result = await service.list();

    expect(result).toEqual(mockPlans);
    expect(repositoryMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('CA-1: sin filas devuelve una lista vacía', async () => {
    repositoryMock.findAll.mockResolvedValue([]);

    const result = await service.list();

    expect(result).toEqual([]);
  });

  it('CA-3: propaga PlanCatalogUnavailableError y la bitácora solo lleva el evento y el tipo de error', async () => {
    repositoryMock.findAll.mockRejectedValue(
      new PlanCatalogUnavailableError(
        new QueryFailedError('SELECT * FROM plan', [], new Error('DB Error')),
      ),
    );

    await expect(service.list()).rejects.toThrow(PlanCatalogUnavailableError);

    expect(loggerMock.error).toHaveBeenCalledWith({
      event: 'billing.plan_catalog_unavailable',
      code: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
      errorName: 'QueryFailedError',
    });
  });

  it('plan §5: un error de programación sigue intacto al filtro global y no se registra como CA-3', async () => {
    const defect = new TypeError("Cannot read properties of undefined (reading 'slug')");
    repositoryMock.findAll.mockRejectedValue(defect);

    await expect(service.list()).rejects.toBe(defect);

    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
