import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';

import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanDomain } from '../domain/plan-catalog';

import { I_PLAN_REPOSITORY } from './i-plan-repository';
import type { IPlanRepository } from './i-plan-repository';
import { PlanCatalogService } from './plan-catalog.service';

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

  it('debe listar los planes correctamente', async () => {
    repositoryMock.findAll.mockResolvedValue(mockPlans);

    const result = await service.list();

    expect(result).toEqual(mockPlans);
    expect(repositoryMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('debe retornar lista vacía si no hay planes', async () => {
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
      code: 'PLAN_CATALOG_UNAVAILABLE',
      errorName: 'QueryFailedError',
    });
    logError.mockRestore();
  });
});
