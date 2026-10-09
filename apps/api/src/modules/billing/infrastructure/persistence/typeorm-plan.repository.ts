import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { IPlanRepository } from '../../application/i-plan-repository';
import type { PlanDomain } from '../../domain/plan-catalog';

import { PlanOrmEntity } from './plan.orm-entity';

const toDomain = (entity: PlanOrmEntity): PlanDomain => ({
  id: entity.id,
  slug: entity.slug,
  nombre: entity.nombre,
  descripcion: entity.descripcion,
  precioCentavos: entity.precioCentavos,
  cuotaBytes: entity.cuotaBytes,
  maxArchivoBytes: entity.maxArchivoBytes,
  maxEditores: entity.maxEditores,
  consultasAgenteMensual: entity.consultasAgenteMensual,
  versionesRetenidas: entity.versionesRetenidas,
  diasRetencionPapelera: entity.diasRetencionPapelera,
});

@Injectable()
export class TypeOrmPlanRepository implements IPlanRepository {
  constructor(
    @InjectRepository(PlanOrmEntity)
    private readonly repository: Repository<PlanOrmEntity>,
  ) {}

  /** Orden de RN-2: precio ascendente y, en empate, `slug`. */
  async findAll(): Promise<PlanDomain[]> {
    const entities = await this.repository.find({ order: { precioCentavos: 'ASC', slug: 'ASC' } });
    return entities.map(toDomain);
  }
}
