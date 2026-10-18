import type { EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';

import type { TransactionContext } from '../../../../shared';
import { PlanCatalogUnavailableError } from '../../domain/errors/plan-catalog-unavailable.error';

import { TypeOrmPlanRepository } from './typeorm-plan.repository';

const repositoryWith = (find: jest.Mock): TypeOrmPlanRepository => {
  const manager = { getRepository: () => ({ find }) } as unknown as EntityManager;
  return new TypeOrmPlanRepository({ manager: () => manager } as unknown as TransactionContext);
};

describe('TypeOrmPlanRepository.findActive (008 CA-3, plan §5)', () => {
  it('CA-3: una consulta fallida se traduce a PlanCatalogUnavailableError con el tipo del error original', async () => {
    const repository = repositoryWith(
      jest
        .fn()
        .mockRejectedValue(new QueryFailedError('SELECT * FROM plan', [], new Error('DB Error'))),
    );

    const failure = repository.findActive();

    await expect(failure).rejects.toBeInstanceOf(PlanCatalogUnavailableError);
    await expect(failure).rejects.toMatchObject({ causeName: 'QueryFailedError' });
  });

  it('CA-3: con la base caída también rechaza con PlanCatalogUnavailableError', async () => {
    const repository = repositoryWith(
      jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    );

    await expect(repository.findActive()).rejects.toBeInstanceOf(PlanCatalogUnavailableError);
  });

  it('plan §5: un defecto al mapear las filas no se disfraza de catálogo no disponible', async () => {
    const repository = repositoryWith(jest.fn().mockResolvedValue([null]));

    await expect(repository.findActive()).rejects.toBeInstanceOf(TypeError);
  });

  it('011 CA-8: `findAll` usa el mismo orden y no filtra por `desactivado_en`', async () => {
    const find = jest.fn().mockResolvedValue([]);

    await repositoryWith(find).findAll();

    expect(find).toHaveBeenCalledWith({ where: {}, order: { precioCentavos: 'ASC', slug: 'ASC' } });
  });
});
