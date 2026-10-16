import type { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';

import { PlanCatalogUnavailableError } from '../../domain/errors/plan-catalog-unavailable.error';

import type { PlanOrmEntity } from './plan.orm-entity';
import { TypeOrmPlanRepository } from './typeorm-plan.repository';

const repositoryWith = (find: jest.Mock): TypeOrmPlanRepository =>
  new TypeOrmPlanRepository({ find } as unknown as Repository<PlanOrmEntity>);

describe('TypeOrmPlanRepository', () => {
  it('CA-3: una consulta fallida se traduce a PlanCatalogUnavailableError con el tipo del error original', async () => {
    const repository = repositoryWith(
      jest
        .fn()
        .mockRejectedValue(new QueryFailedError('SELECT * FROM plan', [], new Error('DB Error'))),
    );

    const failure = repository.findAll();

    await expect(failure).rejects.toBeInstanceOf(PlanCatalogUnavailableError);
    await expect(failure).rejects.toMatchObject({ causeName: 'QueryFailedError' });
  });

  it('CA-3: con la base caída también rechaza con PlanCatalogUnavailableError', async () => {
    const repository = repositoryWith(
      jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    );

    await expect(repository.findAll()).rejects.toBeInstanceOf(PlanCatalogUnavailableError);
  });

  it('plan §5: un defecto al mapear las filas no se disfraza de catálogo no disponible', async () => {
    const repository = repositoryWith(jest.fn().mockResolvedValue([null]));

    await expect(repository.findAll()).rejects.toBeInstanceOf(TypeError);
  });
});
