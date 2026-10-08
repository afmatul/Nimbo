import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { I_PLAN_REPOSITORY } from './i-plan-repository';
import type { IPlanRepository } from './i-plan-repository';
import type { PlanDomain } from '../domain/plan-catalog';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';

@Injectable()
export class PlanCatalogService {
  private readonly logger = new Logger(PlanCatalogService.name);

  constructor(
    @Inject(I_PLAN_REPOSITORY)
    private readonly planRepository: IPlanRepository,
  ) {}

  async list(): Promise<PlanDomain[]> {
    try {
      return await this.planRepository.findAll();
    } catch (error) {
      if (error instanceof QueryFailedError) {
        // Solo el code: sin SQL ni datos de usuario (spec 008, sección 5)
        this.logger.error('PLAN_CATALOG_UNAVAILABLE');
        throw new PlanCatalogUnavailableError();
      }
      throw error;
    }
  }
}