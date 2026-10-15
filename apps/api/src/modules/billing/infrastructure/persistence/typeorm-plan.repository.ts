import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { IPlanRepository } from '../../application/i-plan-repository';
import { PlanCatalogUnavailableError } from '../../domain/errors/plan-catalog-unavailable.error';
import type { PlanSummary } from '../../domain/plan-summary';

import { PlanOrmEntity } from './plan.orm-entity';

const toSummary = (entity: PlanOrmEntity): PlanSummary => ({
  id: entity.id,
  slug: entity.slug,
  name: entity.nombre,
  description: entity.descripcion,
  priceCents: entity.precioCentavos,
  quotaBytes: entity.cuotaBytes,
  maxFileBytes: entity.maxArchivoBytes,
  maxEditors: entity.maxEditores,
  agentQueriesPerMonth: entity.consultasAgenteMensual,
  retainedVersions: entity.versionesRetenidas,
  trashRetentionDays: entity.diasRetencionPapelera,
});

@Injectable()
export class TypeOrmPlanRepository implements IPlanRepository {
  constructor(
    @InjectRepository(PlanOrmEntity)
    private readonly repository: Repository<PlanOrmEntity>,
  ) {}

  /**
   * Orden de RN-2: precio ascendente y, en empate, `slug`. Solo la consulta se traduce a CA-3; un fallo del mapeo es
   * un defecto y sigue como está (plan 008 §5).
   */
  async findAll(): Promise<PlanSummary[]> {
    const entities = await this.repository
      .find({ order: { precioCentavos: 'ASC', slug: 'ASC' } })
      .catch((error: unknown) => {
        throw new PlanCatalogUnavailableError(error);
      });
    return entities.map(toSummary);
  }
}
