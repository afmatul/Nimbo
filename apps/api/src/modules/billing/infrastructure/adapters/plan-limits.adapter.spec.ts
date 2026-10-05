import type { Repository } from 'typeorm';

import { createActor, Role } from '../../../../shared';
import type { PlanLimits } from '../../../storage';
import { PlanNotFoundError } from '../../domain/errors';
import type { PlanOrmEntity } from '../persistence/plan.orm-entity';

import { PlanLimitsAdapter } from './plan-limits.adapter';

const PERSONAL: PlanLimits = {
  planName: 'Personal',
  maxFileBytes: 52428800n,
  storageQuotaBytes: 16106127360n,
  trashRetentionDays: 7,
};

describe('PlanLimitsAdapter (006a T-08, CA-4, CA-5, RN-4; 006 CA-19)', () => {
  let adapter: PlanLimitsAdapter;
  let mockRepo: jest.Mocked<Pick<Repository<PlanOrmEntity>, 'findOneBy'>>;

  beforeEach(() => {
    mockRepo = {
      findOneBy: jest.fn(),
    };
    adapter = new PlanLimitsAdapter(mockRepo as unknown as Repository<PlanOrmEntity>);
  });

  describe('limitsFor(actor) (CA-5, Art. VI)', () => {
    it('CA-5: devuelve Personal leyendo la fila de la tabla plan sin consultar identity', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        slug: 'personal',
        nombre: 'Personal',
        cuotaBytes: 16106127360n,
        maxArchivoBytes: 52428800n,
        diasRetencionPapelera: 7,
      } as PlanOrmEntity);

      const limits = await adapter.limitsFor(
        createActor('123e4567-e89b-12d3-a456-426614174000', Role.CLIENT),
      );

      expect(limits).toEqual(PERSONAL);
      expect(mockRepo.findOneBy).toHaveBeenCalledWith({ slug: 'personal' });
    });

    it('CA-5: devuelve los mismos límites para cualquier rol', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        slug: 'personal',
        nombre: 'Personal',
        cuotaBytes: 16106127360n,
        maxArchivoBytes: 52428800n,
        diasRetencionPapelera: 7,
      } as PlanOrmEntity);

      const limits = await adapter.limitsFor(createActor('admin-id', Role.ADMIN));

      expect(limits).toEqual(PERSONAL);
      expect(mockRepo.findOneBy).toHaveBeenCalledWith({ slug: 'personal' });
    });

    it('lanza PlanNotFoundError si no existe la fila personal en la tabla plan', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(
        adapter.limitsFor(createActor('123e4567-e89b-12d3-a456-426614174000', Role.CLIENT)),
      ).rejects.toThrow(PlanNotFoundError);
    });
  });

  describe('getLimitsByPlanId(planId) (CA-2, CA-4)', () => {
    it('CA-19 (006): la retención en papelera sale de `dias_retencion_papelera`, no del código', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000004',
        slug: 'institucional',
        nombre: 'Institucional',
        cuotaBytes: 2199023255552n,
        maxArchivoBytes: 5368709120n,
        diasRetencionPapelera: 90,
      } as PlanOrmEntity);

      const limits = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000004');

      expect(limits.trashRetentionDays).toBe(90);
    });

    it('CA-1 (007, D-20): el nombre visible del plan sale de `plan.nombre`', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000004',
        slug: 'institucional',
        nombre: 'Institucional',
        cuotaBytes: 2199023255552n,
        maxArchivoBytes: 5368709120n,
        diasRetencionPapelera: 90,
      } as PlanOrmEntity);

      const limits = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000004');

      expect(limits.planName).toBe('Institucional');
    });

    it('CA-2: devuelve los límites del plan cuando existe', async () => {
      mockRepo.findOneBy.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000002',
        slug: 'pro',
        nombre: 'Pro',
        cuotaBytes: 107374182400n,
        maxArchivoBytes: 524288000n,
        diasRetencionPapelera: 30,
      } as PlanOrmEntity);

      const limits = await adapter.getLimitsByPlanId('10000000-0000-4000-8000-000000000002');

      expect(limits).toEqual({
        planName: 'Pro',
        maxFileBytes: 524288000n,
        storageQuotaBytes: 107374182400n,
        trashRetentionDays: 30,
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
        nombre: 'Equipo',
        cuotaBytes: 375809638400n,
        maxArchivoBytes: 1073741824n,
        diasRetencionPapelera: 60,
      } as PlanOrmEntity);

      const limits = await adapter.getLimitsBySlug('equipo');

      expect(limits).toEqual({
        planName: 'Equipo',
        maxFileBytes: 1073741824n,
        storageQuotaBytes: 375809638400n,
        trashRetentionDays: 60,
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
