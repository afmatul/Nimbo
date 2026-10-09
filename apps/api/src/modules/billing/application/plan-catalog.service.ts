import { Inject, Injectable, Logger } from '@nestjs/common';

import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanDomain } from '../domain/plan-catalog';

import { I_PLAN_REPOSITORY } from './i-plan-repository';
import type { IPlanRepository } from './i-plan-repository';

@Injectable()
export class PlanCatalogService {
  private readonly logger = new Logger(PlanCatalogService.name);

  constructor(
    @Inject(I_PLAN_REPOSITORY)
    private readonly planRepository: IPlanRepository,
  ) {}

  /** Cualquier fallo de lectura de `plan` es CA-3. La bitácora solo lleva el tipo de error, sin SQL ni mensaje (spec 008 §5). */
  async list(): Promise<PlanDomain[]> {
    try {
      return await this.planRepository.findAll();
    } catch (error) {
      const unavailable = new PlanCatalogUnavailableError();
      this.logger.error({
        event: 'billing.plan_catalog_unavailable',
        code: unavailable.code,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      throw unavailable;
    }
  }
}
