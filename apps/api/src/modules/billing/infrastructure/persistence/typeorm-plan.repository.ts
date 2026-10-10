import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { IPlanRepository } from '../../application/i-plan-repository';
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

  /** Orden de RN-2: precio ascendente y, en empate, `slug`. */
  async findAll(): Promise<PlanSummary[]> {
    const entities = await this.repository.find({ order: { precioCentavos: 'ASC', slug: 'ASC' } });
    return entities.map(toSummary);
  }
}
