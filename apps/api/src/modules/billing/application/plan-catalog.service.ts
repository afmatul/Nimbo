import { Inject, Injectable, Logger } from '@nestjs/common';
import { IPlanRepository } from './i-plan-repository';
import { PlanDomain } from '../domain/plan-catalog';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';

@Injectable()
export class PlanCatalogService {
  private readonly logger = new Logger(PlanCatalogService.name);

  constructor(
    @Inject(IPlanRepository)
    private readonly planRepository: IPlanRepository,
  ) {}

  async list(): Promise<PlanDomain[]> {
    try {
      return await this.planRepository.listAll();
    } catch (error) {
      if (error instanceof PlanCatalogUnavailableError) {
        throw error;
      }
      
      const err = error as Error;
      this.logger.error('Error al listar el catálogo de planes', err?.stack);
      
      throw new PlanCatalogUnavailableError();
    }
  }
}