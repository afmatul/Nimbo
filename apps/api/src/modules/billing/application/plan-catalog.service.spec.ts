import { QueryFailedError } from 'typeorm';

import { createActor, FixedClock, Role } from '../../../shared';
import type { NewPlan } from '../domain/entities/plan.entity';
import { PlanNotFoundError } from '../domain/errors';
import { PlanAlreadyDeactivatedError } from '../domain/errors/plan-already-deactivated.error';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import { PlanInvalidError } from '../domain/errors/plan-invalid.error';

import { PlanCatalogService } from './plan-catalog.service';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { aPlan, PERSONAL_PLAN } from './testing/plans';

const ADMIN = createActor('30000000-0000-4000-8000-000000000001', Role.ADMIN);
const NOW = new Date('2026-10-14T12:00:00.000Z');
const PRO = aPlan({
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  priceCents: 4500,
});
const NEW_PLAN: NewPlan = {
  name: 'Pro Anual',
  description: null,
  priceCents: 45_000,
  limits: PRO.limits,
};

const setup = () => {
  const repository: jest.Mocked<IPlanRepository> = {
    findActive: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    insert: jest.fn(),
    deactivate: jest.fn(),
  };
  const logger = { info: jest.fn(), error: jest.fn() };
  const service = new PlanCatalogService(repository, new FixedClock(NOW), logger);
  return { service, repository, logger };
};

describe('PlanCatalogService.list (spec 008 CA-1, CA-3)', () => {
  it('CA-1: entrega los planes activos en el orden del repositorio', async () => {
    const { service, repository } = setup();
    repository.findActive.mockResolvedValue([PERSONAL_PLAN, PRO]);

    await expect(service.list()).resolves.toEqual([PERSONAL_PLAN, PRO]);
  });

  it('CA-3: propaga PlanCatalogUnavailableError y la bitácora solo lleva el evento y el tipo de error', async () => {
    const { service, repository, logger } = setup();
    repository.findActive.mockRejectedValue(
      new PlanCatalogUnavailableError(
        new QueryFailedError('SELECT * FROM plan', [], new Error('DB Error')),
      ),
    );

    await expect(service.list()).rejects.toThrow(PlanCatalogUnavailableError);

    expect(logger.error).toHaveBeenCalledWith({
      event: 'billing.plan_catalog_unavailable',
      code: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
      errorName: 'QueryFailedError',
    });
  });

  it('plan 008 §5: un error de programación sigue intacto al filtro global y no se registra como CA-3', async () => {
    const { service, repository, logger } = setup();
    const defect = new TypeError("Cannot read properties of undefined (reading 'slug')");
    repository.findActive.mockRejectedValue(defect);

    await expect(service.list()).rejects.toBe(defect);

    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('PlanCatalogService.create (spec 011 CA-9, CA-11)', () => {
  it('CA-9: guarda el plan validado, activo y con su slug', async () => {
    const { service, repository } = setup();
    repository.insert.mockResolvedValue(true);

    const plan = await service.create(ADMIN, NEW_PLAN);

    expect(plan).toMatchObject({ name: 'Pro Anual', slug: 'pro-anual', deactivatedAt: null });
    expect(repository.insert).toHaveBeenCalledWith(plan);
  });

  it('CA-11: un nombre repetido es 422 con `name` `NAME_TAKEN`', async () => {
    const { service, repository } = setup();
    repository.insert.mockResolvedValue(false);

    const created = service.create(ADMIN, NEW_PLAN);

    await expect(created).rejects.toBeInstanceOf(PlanInvalidError);
    await expect(created).rejects.toMatchObject({
      fields: [{ field: 'name', reason: 'NAME_TAKEN' }],
    });
  });

  it('CA-11: un plan inválido no llega al repositorio', async () => {
    const { service, repository } = setup();

    await expect(service.create(ADMIN, { ...NEW_PLAN, priceCents: -1 })).rejects.toBeInstanceOf(
      PlanInvalidError,
    );
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('PlanCatalogService.deactivate (spec 011 CA-10, CA-11)', () => {
  it('CA-10: desactiva con la hora del reloj y devuelve el plan desactivado', async () => {
    const { service, repository } = setup();
    repository.findById.mockResolvedValue(PRO);
    repository.deactivate.mockResolvedValue(true);

    const plan = await service.deactivate(ADMIN, PRO.id);

    expect(plan.deactivatedAt).toEqual(NOW);
    expect(repository.deactivate).toHaveBeenCalledWith(plan);
  });

  it('006a CA-4: un id inexistente es `PLAN_NOT_FOUND`', async () => {
    const { service, repository } = setup();
    repository.findById.mockResolvedValue(null);

    await expect(service.deactivate(ADMIN, PRO.id)).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('CA-10: si otro Administrador lo desactivó antes (CAS fallido) es `BILLING_PLAN_ALREADY_DEACTIVATED`', async () => {
    const { service, repository } = setup();
    repository.findById.mockResolvedValue(PRO);
    repository.deactivate.mockResolvedValue(false);

    await expect(service.deactivate(ADMIN, PRO.id)).rejects.toBeInstanceOf(
      PlanAlreadyDeactivatedError,
    );
  });
});
