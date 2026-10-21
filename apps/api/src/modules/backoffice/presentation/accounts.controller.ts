import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { enrollInternalAccountRequestSchema, listAccountsQuerySchema } from '@nimbo/contracts';
import type {
  AccountListItem,
  AccountListResponse,
  EnrollInternalAccountRequest,
  InternalRoleName,
  ListAccountsQuery,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import type { EnrollInternalCommand } from '../../identity';
import { AdminService } from '../application/admin.service';

import { toAccountListItem, toAccountListResponse } from './accounts-response';
import {
  accountIdPipe,
  backofficeQueryValidationError,
  enrollmentValidationError,
} from './backoffice-validation';

const ROLE_BY_NAME: Readonly<Record<InternalRoleName, Role>> = {
  ADMIN: Role.ADMIN,
  SUPPORT: Role.SUPPORT,
  OPERATOR: Role.OPERATOR,
};

const enrollCommandOf = (body: EnrollInternalAccountRequest): EnrollInternalCommand => ({
  fullName: body.fullName,
  email: body.email,
  employeeCode: body.employeeCode,
  role: ROLE_BY_NAME[body.role],
});

/**
 * Cuentas y altas internas (011 CA-1 a CA-6; plan §4): solo el Administrador (CA-14; los servicios de cuentas no
 * autorizan por sí mismos). Valida con los contratos, delega en `AdminService` y responde por lista blanca.
 */
@Roles(Role.ADMIN)
@Controller('backoffice/accounts')
export class AccountsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(listAccountsQuerySchema, backofficeQueryValidationError))
    query: ListAccountsQuery,
  ): Promise<AccountListResponse> {
    return toAccountListResponse(await this.admin.list(actor, query));
  }

  @Get(':id')
  async get(
    @CurrentActor() actor: Actor,
    @Param('id', accountIdPipe()) id: string,
  ): Promise<AccountListItem> {
    return toAccountListItem(await this.admin.get(actor, id));
  }

  @Post(':id/suspension')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @CurrentActor() actor: Actor,
    @Param('id', accountIdPipe()) id: string,
  ): Promise<AccountListItem> {
    return toAccountListItem(await this.admin.suspend(actor, id));
  }

  @Delete(':id/suspension')
  async reactivate(
    @CurrentActor() actor: Actor,
    @Param('id', accountIdPipe()) id: string,
  ): Promise<AccountListItem> {
    return toAccountListItem(await this.admin.reactivate(actor, id));
  }

  @Post()
  async enroll(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(enrollInternalAccountRequestSchema, enrollmentValidationError))
    body: EnrollInternalAccountRequest,
  ): Promise<AccountListItem> {
    return toAccountListItem(await this.admin.enroll(actor, enrollCommandOf(body)));
  }
}
