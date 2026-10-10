import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';

import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanSummary } from '../domain/plan-summary';

import { I_PLAN_REPOSITORY } from './i-plan-repository';
import type { IPlanRepository } from './i-plan-repository';
import { PlanCatalogService } from './plan-catalog.service';

describe('PlanCatalogService', () => {
  let service: PlanCatalogService;
  let repositoryMock: jest.Mocked<IPlanRepository>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanCatalogService,
        {
          provide: I_PLAN_REPOSITORY,
          useValue: repositoryMock,
        },
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

  it('CA-3: una consulta fallida se traduce a PlanCatalogUnavailableError', async () => {
    repositoryMock.findAll.mockRejectedValue(
      new QueryFailedError('SELECT * FROM plan', [], new Error('DB Error')),
    );

    await expect(service.list()).rejects.toThrow(PlanCatalogUnavailableError);
  });

  it('CA-3: con la base caída también responde PlanCatalogUnavailableError', async () => {
    repositoryMock.findAll.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    await expect(service.list()).rejects.toThrow(PlanCatalogUnavailableError);
  });

  it('CA-3: la bitácora solo lleva el evento y el tipo de error, sin el mensaje ni el SQL', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    repositoryMock.findAll.mockRejectedValue(
      new QueryFailedError('SELECT * FROM plan', [], new Error('DB Error')),
    );

    await expect(service.list()).rejects.toThrow(PlanCatalogUnavailableError);

    expect(logError).toHaveBeenCalledWith({
      event: 'billing.plan_catalog_unavailable',
      code: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
      errorName: 'QueryFailedError',
    });
    logError.mockRestore();
  });
});
