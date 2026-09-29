import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
} from '@nimbo/contracts';
import type {
  AcceptedResponse,
  RegisterRequest,
  ResendVerificationRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@nimbo/contracts';

import { ZodValidationPipe } from '../../../shared';
import { RegistrationService } from '../application/registration.service';

import {
  IdentityIpThrottlerGuard,
  REGISTER_IP_THROTTLER,
  RESEND_IP_THROTTLER,
} from './identity-ip-throttler.guard';
import { identityValidationError } from './identity-validation';

/** Respuesta neutra de registro y reenvío: la misma exista o no la cuenta (spec §7). */
const ACCEPTED: AcceptedResponse = { status: 'accepted' };

/**
 * Rutas públicas de registro y verificación (plan §5, §6.5). Solo validan, delegan en `RegistrationService` y
 * mapean el resultado al contrato; sin reglas de negocio. No construyen `Actor`: una cabecera `Authorization` se
 * ignora (CA-7). `Cache-Control: no-store` lo pone `NoStoreMiddleware` desde `IdentityModule`. 003 las marcará
 * `@Public()`.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(IdentityIpThrottlerGuard)
  @SkipThrottle({ [RESEND_IP_THROTTLER]: true })
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema, identityValidationError))
    body: RegisterRequest,
  ): Promise<AcceptedResponse> {
    const { fullName, email, password } = body;
    await this.registration.register({ fullName, email, password });
    return ACCEPTED;
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(IdentityIpThrottlerGuard)
  @SkipThrottle({ [REGISTER_IP_THROTTLER]: true })
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationRequestSchema, identityValidationError))
    body: ResendVerificationRequest,
  ): Promise<AcceptedResponse> {
    await this.registration.resendVerification({ email: body.email });
    return ACCEPTED;
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema, identityValidationError))
    body: VerifyEmailRequest,
  ): Promise<VerifyEmailResponse> {
    const result = await this.registration.verifyEmail(body.token);
    return { status: result.outcome === 'VERIFIED' ? 'verified' : 'already-verified' };
  }
}
