import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import {
  accountSetupCheckRequestSchema,
  accountSetupRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  resetTokenRequestSchema,
} from '@nimbo/contracts';
import type {
  AcceptedResponse,
  AccountSetupCheckRequest,
  AccountSetupCheckResponse,
  AccountSetupRequest,
  AccountSetupResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ResetTokenRequest,
} from '@nimbo/contracts';
import type { Response } from 'express';

import {
  ALL_ROLES,
  CurrentActor,
  CurrentSessionId,
  Public,
  Roles,
  ZodValidationPipe,
} from '../../../shared';
import type { Actor } from '../../../shared';
import { AccountSetupService } from '../application/account-setup.service';
import { IDENTITY_CONFIG } from '../application/identity-config';
import type { IdentityConfig } from '../application/identity-config';
import { PasswordService } from '../application/password.service';

import { identityValidationError } from './identity-validation';
import { SessionCookies } from './session-cookies';

/** Respuesta neutra del pedido: la misma exista o no la cuenta (spec §7, CA-18). */
const ACCEPTED: AcceptedResponse = { status: 'accepted' };

/**
 * Rutas de la recuperación y el cambio de contraseña (plan 002 §5, §6.5) y de la primera contraseña de una cuenta
 * interna (011 plan §4). Solo validan con los esquemas de `contracts`, delegan en `PasswordService` o
 * `AccountSetupService` y mapean el resultado; sin reglas de negocio. `@Public()` excluye las de
 * recuperación de los guards globales de 003; el cambio exige sesión y lee el actor y la sesión con los decoradores
 * de 003. `Cache-Control: no-store` lo pone `NoStoreMiddleware` desde `IdentityModule`.
 */
@Controller('auth')
export class PasswordController {
  private readonly cookies: SessionCookies;

  constructor(
    private readonly passwords: PasswordService,
    private readonly accountSetup: AccountSetupService,
    @Inject(IDENTITY_CONFIG) config: IdentityConfig,
  ) {
    this.cookies = new SessionCookies(config.cookieSecure);
  }

  /** CA-18: `202` idéntico para las cuatro clases de cuenta. */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema, identityValidationError))
    body: ForgotPasswordRequest,
  ): Promise<AcceptedResponse> {
    await this.passwords.requestReset({ email: body.email });
    return ACCEPTED;
  }

  /** CA-20: revisa el enlace al abrirlo, sin consumirlo. */
  @Public()
  @Post('reset-password/check')
  @HttpCode(HttpStatus.OK)
  async checkResetLink(
    @Body(new ZodValidationPipe(resetTokenRequestSchema, identityValidationError))
    body: ResetTokenRequest,
  ): Promise<{ readonly status: 'valid' }> {
    await this.passwords.checkResetLink(body.token);
    return { status: 'valid' };
  }

  /** CA-19: no crea sesión; borra `nimbo_rt` de este navegador porque su sesión ya quedó revocada. */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema, identityValidationError))
    body: ResetPasswordRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ readonly status: 'password-reset' }> {
    const { token, password } = body;
    await this.passwords.resetPassword({ token, password });
    this.cookies.clearRefresh(res);
    return { status: 'password-reset' };
  }

  /**
   * CA-22, CA-23: cada rol cambia solo la suya; las demás sesiones se cierran y esta sigue abierta. Una contraseña
   * nueva vacía pasa el esquema y el servicio la rechaza como débil sobre `newPassword`.
   */
  @Roles(...ALL_ROLES)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentActor() actor: Actor,
    @CurrentSessionId() sessionId: string,
    @Body(new ZodValidationPipe(changePasswordRequestSchema, identityValidationError))
    body: ChangePasswordRequest,
  ): Promise<void> {
    const { currentPassword, newPassword } = body;
    await this.passwords.changePassword(actor, sessionId, { currentPassword, newPassword });
  }

  /** 011 CA-5: revisa el enlace de alta al abrirlo, sin consumirlo. Sin límite de tasa propio (PD-88). */
  @Public()
  @Post('account-setup/check')
  @HttpCode(HttpStatus.OK)
  async checkAccountSetupLink(
    @Body(new ZodValidationPipe(accountSetupCheckRequestSchema, identityValidationError))
    body: AccountSetupCheckRequest,
  ): Promise<AccountSetupCheckResponse> {
    await this.accountSetup.checkLink(body.token);
    return { status: 'valid' };
  }

  /** 011 CA-5: fija la primera contraseña con el enlace de alta; no crea ni revoca sesiones (PD-88). */
  @Public()
  @Post('account-setup')
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
