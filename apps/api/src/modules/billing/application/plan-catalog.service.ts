import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { PlanCatalogUnavailableError } from '../domain/errors/plan-catalog-unavailable.error';
import type { PlanSummary } from '../domain/plan-summary';

import { I_PLAN_REPOSITORY } from './i-plan-repository';
import type { IPlanRepository } from './i-plan-repository';

/** Lo mínimo que el servicio necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). */
interface PlanCatalogLogger {
  error(payload: Record<string, unknown>): void;
}

@Injectable()
export class PlanCatalogService {
  constructor(
    @Inject(I_PLAN_REPOSITORY)
    private readonly planRepository: IPlanRepository,
    @Inject(PinoLogger) private readonly logger: PlanCatalogLogger,
  ) {}

  /**
   * CA-3: solo el fallo de lectura del repositorio se registra como catálogo no disponible; cualquier otra excepción
   * sigue intacta al filtro global como `INTERNAL_ERROR` (plan 008 §5). La bitácora lleva el tipo, sin SQL ni mensaje.
   */
  async list(): Promise<PlanSummary[]> {
    try {
      return await this.planRepository.findAll();
    } catch (error) {
      if (error instanceof PlanCatalogUnavailableError) {
        this.logger.error({
          event: 'billing.plan_catalog_unavailable',
          code: error.code,
          errorName: error.causeName,
        });
      }
      throw error;
    }
  }
}
