import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import {
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  resetTokenRequestSchema,
} from '@nimbo/contracts';
import type {
  AcceptedResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ResetTokenRequest,
} from '@nimbo/contracts';
import type { Response } from 'express';

import { Public, ZodValidationPipe } from '../../../shared';
import { IDENTITY_CONFIG } from '../application/identity-config';
import type { IdentityConfig } from '../application/identity-config';
import { PasswordService } from '../application/password.service';

import { identityValidationError } from './identity-validation';
import { SessionCookies } from './session-cookies';

/** Respuesta neutra del pedido: la misma exista o no la cuenta (spec §7, CA-18). */
const ACCEPTED: AcceptedResponse = { status: 'accepted' };

/**
 * Rutas públicas de la recuperación de contraseña (plan 002 §5, §6.5). Solo validan con los esquemas de `contracts`,
 * delegan en `PasswordService` y mapean el resultado; sin reglas de negocio. `@Public()` las excluye de los guards
 * globales de 003. `Cache-Control: no-store` lo pone `NoStoreMiddleware` desde `IdentityModule`.
 */
@Controller('auth')
export class PasswordController {
  private readonly cookies: SessionCookies;

  constructor(
    private readonly passwords: PasswordService,
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
}
