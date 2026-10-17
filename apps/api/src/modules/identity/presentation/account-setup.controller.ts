import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { accountSetupCheckRequestSchema, accountSetupRequestSchema } from '@nimbo/contracts';
import type {
  AccountSetupCheckRequest,
  AccountSetupCheckResponse,
  AccountSetupRequest,
  AccountSetupResponse,
} from '@nimbo/contracts';

import { Public, ZodValidationPipe } from '../../../shared';
import { AccountSetupService } from '../application/account-setup.service';

import { identityValidationError } from './identity-validation';

/**
 * Rutas de la primera contraseña de una cuenta interna (011 plan §4), con el enlace «Crear tu contraseña» de la
 * invitación o del alta inicial. Solo validan con los esquemas de `contracts`, delegan en `AccountSetupService` y
 * mapean el resultado. `@Public()`: quien llega aún no tiene contraseña. Reciben el token del enlace, así que
 * `NoStoreMiddleware` (desde `IdentityModule`) les pone `Cache-Control: no-store`.
 */
@Controller('auth/account-setup')
export class AccountSetupController {
  constructor(private readonly accountSetup: AccountSetupService) {}

  /** CA-5: revisa el enlace de alta al abrirlo, sin consumirlo. Sin límite de tasa propio (PD-88). */
  @Public()
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async checkLink(
    @Body(new ZodValidationPipe(accountSetupCheckRequestSchema, identityValidationError))
    body: AccountSetupCheckRequest,
  ): Promise<AccountSetupCheckResponse> {
    await this.accountSetup.checkLink(body.token);
    return { status: 'valid' };
  }

  /** CA-5: fija la primera contraseña con el enlace de alta; no crea ni revoca sesiones (PD-88). */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async setFirstPassword(
    @Body(new ZodValidationPipe(accountSetupRequestSchema, identityValidationError))
    body: AccountSetupRequest,
  ): Promise<AccountSetupResponse> {
    const { token, password } = body;
    await this.accountSetup.setFirstPassword({ token, password });
    return { status: 'password-set' };
  }
}
