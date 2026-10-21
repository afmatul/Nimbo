import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { createPlanRequestSchema } from '@nimbo/contracts';
import type { CreatePlanRequest, PlanAdminListResponse, PlanAdminView } from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import type { NewPlan } from '../../billing';
import { CatalogAdminService } from '../application/catalog-admin.service';

import { planIdPipe, planValidationError } from './backoffice-validation';
import { toPlanAdminListResponse, toPlanAdminView } from './plans-response';

/** Del contrato (bytes como texto) al plan nuevo de `billing` (bytes en `bigint`, ADR-0016). */
const newPlanOf = (body: CreatePlanRequest): NewPlan => ({
  name: body.name,
  description: body.description,
  priceCents: body.priceCents,
  limits: {
    quotaBytes: BigInt(body.quotaBytes),
    maxFileBytes: BigInt(body.maxFileBytes),
    maxEditors: body.maxEditors,
    agentQueriesPerMonth: body.agentQueriesPerMonth,
    retainedVersions: body.retainedVersions,
    trashRetentionDays: body.trashRetentionDays,
  },
});

/**
 * Catálogo de planes (011 CA-8 a CA-11; plan §4): solo el Administrador (CA-14). Valida la forma con el contrato (las
 * reglas de un plan las valida `billing`), delega en `CatalogAdminService` y responde por lista blanca. Un plan no se
 * edita (RN-4): no hay ruta para hacerlo.
 */
@Roles(Role.ADMIN)
@Controller('backoffice/plans')
export class PlansController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<PlanAdminListResponse> {
    return toPlanAdminListResponse(await this.catalog.list(actor));
  }

  @Post()
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createPlanRequestSchema, planValidationError))
    body: CreatePlanRequest,
  ): Promise<PlanAdminView> {
    return toPlanAdminView(await this.catalog.create(actor, newPlanOf(body)));
  }

  @Post(':id/deactivation')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentActor() actor: Actor,
    @Param('id', planIdPipe()) id: string,
  ): Promise<PlanAdminView> {
    return toPlanAdminView(await this.catalog.deactivate(actor, id));
  }
}
