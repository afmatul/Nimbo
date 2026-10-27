import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { adjustQuotaRequestSchema } from '@nimbo/contracts';
import type { AccountLimits, AdjustQuotaRequest } from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { AccountAdjustmentsService } from '../application/account-adjustments.service';

import { toAccountLimits } from './account-limits.response';
import { accountIdPipe, quotaValidationError } from './backoffice-validation';

/**
 * Límites, cuota y vigencia de una cuenta (011b plan §4; DF-81): solo el Administrador (CA-16; el servicio no
 * autoriza por sí mismo). Valida con los contratos, delega en `AccountAdjustmentsService` y responde por lista blanca.
 */
@Roles(Role.ADMIN)
@Controller('backoffice/accounts')
export class AccountAdjustmentsController {
  constructor(private readonly adjustments: AccountAdjustmentsService) {}

  @Get(':id/limits')
  async limits(
    @CurrentActor() actor: Actor,
    @Param('id', accountIdPipe()) id: string,
  ): Promise<AccountLimits> {
    return toAccountLimits(await this.adjustments.limits(actor, id));
  }

  @Put(':id/quota')
  async adjustQuota(
    @CurrentActor() actor: Actor,
    @Param('id', accountIdPipe()) id: string,
    @Body(new ZodValidationPipe(adjustQuotaRequestSchema, quotaValidationError))
    body: AdjustQuotaRequest,
  ): Promise<AccountLimits> {
    const extra = { bytes: BigInt(body.extraBytes), lastDay: body.until };
    return toAccountLimits(await this.adjustments.adjustQuota(actor, { clientId: id, extra }));
  }

  @Delete(':id/quota')
  async removeQuota(
    @CurrentActor() actor: Actor,
    @Param('id', accountIdPipe()) id: string,
  ): Promise<AccountLimits> {
    return toAccountLimits(
      await this.adjustments.adjustQuota(actor, { clientId: id, extra: null }),
    );
  }
}
