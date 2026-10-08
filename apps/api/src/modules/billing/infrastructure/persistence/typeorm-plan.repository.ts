import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IPlanRepository } from '../../application/i-plan-repository';
import type { PlanDomain } from '../../domain/plan-catalog';
import { PlanOrmEntity } from './plan.orm-entity';

@Injectable()
export class TypeOrmPlanRepository implements IPlanRepository {
  constructor(
    @InjectRepository(PlanOrmEntity)
    private readonly repository: Repository<PlanOrmEntity>,
  ) {}

  async findAll(): Promise<PlanDomain[]> {
    const entities = await this.repository.find({
      order: {
        precioCentavos: 'ASC',
        slug: 'ASC',
      },
    });

    return entities.map(
      (entity): PlanDomain => ({
        id: entity.id,
        slug: entity.slug,
        nombre: entity.nombre,
        descripcion: entity.descripcion ?? '',
        precioCentavos: Number(entity.precioCentavos),
        cuotaBytes: BigInt(entity.cuotaBytes),
        maxArchivoBytes: BigInt(entity.maxArchivoBytes),
        maxEditores: Number(entity.maxEditores),
        consultasAgenteMensual: Number(entity.consultasAgenteMensual),
        versionesRetenidas: Number(entity.versionesRetenidas),
        diasRetencionPapelera: Number(entity.diasRetencionPapelera),
      }),
    );
  }
}