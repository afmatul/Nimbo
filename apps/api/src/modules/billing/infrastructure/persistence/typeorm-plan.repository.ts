import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPlanRepository } from '../../application/i-plan-repository';
import { PlanDomain } from '../../domain/plan-catalog';
import { PlanOrmEntity } from './plan.orm-entity';

@Injectable()
export class TypeOrmPlanRepository implements IPlanRepository {
  constructor(
    @InjectRepository(PlanOrmEntity)
    private readonly repository: Repository<PlanOrmEntity>,
  ) {}

async listAll(): Promise<PlanDomain[]> {
    const entities = await this.repository.find({
      order: {
        precioCentavos: 'ASC',
        slug: 'ASC',
      },
    });

    return entities.map((entity): PlanDomain => ({
      id: String(entity.id),
      slug: String(entity.slug),
      nombre: String(entity.nombre),
      descripcion: String(entity.descripcion),
      precioCentavos: Number(entity.precioCentavos),
      cuotaBytes: BigInt(entity.cuotaBytes ?? 0),
      maxArchivoBytes: BigInt(entity.maxArchivoBytes ?? 0),
      maxEditores: Number(entity.maxEditores),
      consultasAgenteMensual: Number(entity.consultasAgenteMensual),
      versionesRetenidas: Number(entity.versionesRetenidas),
      diasRetencionPapelera: Number(entity.diasRetencionPapelera),
    }));
  }
}