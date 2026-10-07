import { Inject, Injectable } from '@nestjs/common';
import { IPlanRepository } from './i-plan-repository';
import { PlanDomain } from '../domain/plan-catalog';
import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';

@Injectable()
export class PlanCatalogService {
  constructor(
    @Inject(IPlanRepository)
    private readonly planRepository: IPlanRepository,
  ) {}

  async list(): Promise<PlanDomain[]> {
    try {
      return await this.planRepository.listAll();
    } catch (error) {
      throw new PlanCatalogUnavailableError();
    }
  }
}