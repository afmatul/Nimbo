import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { IPlanRepository } from '../../application/ports/i-plan-repository.port';
import type { Plan } from '../../domain/entities/plan.entity';
import { PlanCatalogUnavailableError } from '../../domain/errors/plan-catalog-unavailable.error';

import { toPlan, toPlanRow } from './plan.mapper';
import { PlanOrmEntity } from './plan.orm-entity';

/**
 * `IPlanRepository` sobre el `EntityManager` de `TransactionContext` (011 plan §2): con `@InjectRepository` el alta y
 * la baja escaparían de la transacción de `backoffice` y de su evento de auditoría.
 */
@Injectable()
export class TypeOrmPlanRepository implements IPlanRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  /** 008 CA-1: solo los activos (PD-76). */
  findActive(): Promise<Plan[]> {
    return this.findOrdered({ desactivadoEn: IsNull() });
  }

  /** 011 CA-8, CA-12: activos y desactivados. */
  findAll(): Promise<Plan[]> {
    return this.findOrdered({});
  }

  /**
   * 008 RN-2: precio ascendente y, en empate, `slug`. Solo la consulta se traduce a CA-3; un fallo del mapeo es un
   * defecto y sigue como está (plan 008 §5).
   */
  private async findOrdered(where: FindOptionsWhere<PlanOrmEntity>): Promise<Plan[]> {
    const rows = await this.plans()
      .find({ where, order: { precioCentavos: 'ASC', slug: 'ASC' } })
      .catch((error: unknown) => {
        throw new PlanCatalogUnavailableError(error);
      });
    return rows.map(toPlan);
  }

  async findById(id: string): Promise<Plan | null> {
    const row = await this.plans().findOneBy({ id });
    return row === null ? null : toPlan(row);
  }

  async findBySlug(slug: string): Promise<Plan | null> {
    const row = await this.plans().findOneBy({ slug });
    return row === null ? null : toPlan(row);
  }

  /** Cualquier unicidad (`uq_plan_nombre` o `slug`) deja la fila sin insertar: el llamador lo informa como nombre repetido. */
  async insert(plan: Plan): Promise<boolean> {
    const result = await this.plans()
      .createQueryBuilder()
      .insert()
      .values(toPlanRow(plan))
      .orIgnore()
      .execute();
    // `RETURNING` solo trae la fila si se insertó: `identifiers` repetiría el `id` que ya pone la aplicación.
    return (result.raw as unknown[]).length === 1;
  }

  async deactivate(plan: Plan): Promise<boolean> {
    const result = await this.plans().update(
      { id: plan.id, desactivadoEn: IsNull() },
      { desactivadoEn: plan.deactivatedAt },
    );
    return result.affected === 1;
  }

  private plans(): Repository<PlanOrmEntity> {
    return this.context.manager().getRepository(PlanOrmEntity);
  }
}
