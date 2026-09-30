import type { Repository } from 'typeorm';

import { createActor, Role } from '../../../../shared';
import type { PlanLimits } from '../../../storage';
import { PlanNotFoundError } from '../../domain/errors';
import type { PlanOrmEntity } from '../persistence/plan.orm-entity';

import { PlanLimitsAdapter } from './plan-limits.adapter';

const PERSONAL: PlanLimits = {
  maxFileBytes: 52428800n,
  storageQuotaBytes: 16106127360n,
};

describe('PlanLimitsAdapter (T-08, CA-4, CA-5, RN-4)', () => {
  let adapter: PlanLimitsAdapter;
  let mockRepo: jest.Mocked<Pick<Repository<PlanOrmEntity>, 'findOneBy'>>;

  beforeEach(() => {
    mockRepo = {
      findOneBy: jest.fn(),
    };
    adapter = new PlanLimitsAdapter(mockRepo as unknown as Repository<PlanOrmEntity>);
  });

  describe('limitsFor(actor) (CA-5)', () => {
    it('CA-5: devuelve Personal sin consultar la base ni identity', async () => {
      const limits = await adapter.limitsFor(
        createActor('123e4567-e89b-12d3-a456-426614174000', Role.CLIENT),
      );

      expect(limits).toEqual(PERSONAL);
      expect(mockRepo.findOneBy).not.toHaveBeenCalled();
    });

    it('CA-5: devuelve los mismos límites para cualquier rol', async () => {
      const limits = await adapter.limitsFor(createActor('admin-id', Role.ADMIN));

      expect(limits).toEqual(PERSONAL);
    });
  });

  describe('getLimitsByPlanId(planId) (CA-2, CA-4)', () => {
    it('CA-2: devuelve los límites del plan cuando existe', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000002',
        slug: 'pro',
        cuotaBytes: 107374182400n,
        maxArchivoBytes: 524288000n,
      } as PlanOrmEntity);

      const limits = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000002');

      expect(limits).toEqual({
        maxFileBytes: 524288000n,
        storageQuotaBytes: 107374182400n,
      });
      expect(mockRepo.findOneBy).toHaveBeenCalledWith({
        id: '10000000-0000-4000-8000-000000000002',
      });
    });

    it('CA-4: lanza PlanNotFoundError cuando el id no existe', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(adapter.getLimitsByPlanId('inexistente')).rejects.toThrow(PlanNotFoundError);
      await expect(adapter.getLimitsByPlanId('inexistente')).rejects.toMatchObject({
        code: 'PLAN_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('getLimitsBySlug(slug) (CA-3, CA-4)', () => {
    it('CA-3: devuelve los límites del plan cuando el slug existe', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000003',
        slug: 'equipo',
        cuotaBytes: 375809638400n,
        maxArchivoBytes: 1073741824n,
      } as PlanOrmEntity);

      const limits = await adapter.getLimitsBySlug('equipo');

      expect(limits).toEqual({
        maxFileBytes: 1073741824n,
        storageQuotaBytes: 375809638400n,
      });
      expect(mockRepo.findOneBy).toHaveBeenCalledWith({ slug: 'equipo' });
    });

    it('CA-4: lanza PlanNotFoundError cuando el slug no existe', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(adapter.getLimitsBySlug('plan-falso')).rejects.toThrow(PlanNotFoundError);
      await expect(adapter.getLimitsBySlug('plan-falso')).rejects.toMatchObject({
        code: 'PLAN_NOT_FOUND',
        status: 404,
      });
    });
  });
});
