import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  loginRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
} from '@nimbo/contracts';
import type {
  AcceptedResponse,
  LoginRequest,
  RegisterRequest,
  ResendVerificationRequest,
  SessionResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@nimbo/contracts';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { Public, ZodValidationPipe } from '../../../shared';
import { AuthService } from '../application/auth.service';
import { IDENTITY_CONFIG } from '../application/identity-config';
import type { IdentityConfig } from '../application/identity-config';
import type { IdentityLogger } from '../application/identity-logger';
import { RegistrationService } from '../application/registration.service';
import type { VerifyEmailResult } from '../application/registration.service';
import { SessionService } from '../application/session.service';
import type { OpenedSession } from '../application/session.service';
import { SessionExpiredError, SessionRevokedError } from '../domain/errors';

import { readClientContext } from './client-context.factory';
import {
  IdentityIpThrottlerGuard,
  LOGIN_IP_THROTTLER,
  REGISTER_IP_THROTTLER,
  RESEND_IP_THROTTLER,
} from './identity-ip-throttler.guard';
import { identityValidationError } from './identity-validation';
import { REFRESH_COOKIE, readCookie, SessionCookies } from './session-cookies';
import { toSessionResponse } from './session-response';

/** Respuesta neutra de registro y reenvío: la misma exista o no la cuenta (spec §7). */
const ACCEPTED: AcceptedResponse = { status: 'accepted' };

/** Rechazos de renovación tras los que la cookie ya no sirve; `REFRESH_INVALID` nunca la borra (CA-9). */
const endsSession = (error: unknown): boolean =>
  error instanceof SessionExpiredError || error instanceof SessionRevokedError;

/**
 * Rutas públicas de registro, verificación, inicio de sesión y renovación (plan 001 §5, plan 002 §5, §6.5). Solo
 * validan, delegan en los servicios, escriben cookies y mapean el resultado al contrato; sin reglas de negocio. No
 * construyen `Actor`: `@Public()` las excluye de los guards globales de autenticación y roles de 003 y `JwtAuthGuard`
 * no mira la cabecera `Authorization` (CA-7). `Cache-Control: no-store` lo pone `NoStoreMiddleware` desde
 * `IdentityModule`.
 */
@Public()
@Controller('auth')
export class AuthController {
  private readonly cookies: SessionCookies;

  constructor(
    private readonly registration: RegistrationService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(IDENTITY_CONFIG) config: IdentityConfig,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {
    this.cookies = new SessionCookies(config.cookieSecure);
  }

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(IdentityIpThrottlerGuard)
  @SkipThrottle({ [RESEND_IP_THROTTLER]: true, [LOGIN_IP_THROTTLER]: true })
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
  @SkipThrottle({ [REGISTER_IP_THROTTLER]: true, [LOGIN_IP_THROTTLER]: true })
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationRequestSchema, identityValidationError))
    body: ResendVerificationRequest,
  ): Promise<AcceptedResponse> {
    await this.registration.resendVerification({ email: body.email });
    return ACCEPTED;
  }

  /** 002 CA-15: la apertura que verifica abre sesión; si eso falla, la verificación sigue confirmada. */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema, identityValidationError))
    body: VerifyEmailRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerifyEmailResponse> {
    const result = await this.registration.verifyEmail(body.token);
    if (result.outcome === 'ALREADY_VERIFIED') {
      return { status: 'already-verified' };
    }
    const opened = await this.openAfterVerification(result, req);
    return opened === null
      ? { status: 'verified' }
      : { status: 'verified', session: this.writeSession(res, opened) };
  }

  /** CA-1 a CA-6. `login-ip` cuenta todos los intentos y corre antes del pipe (CA-6). */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdentityIpThrottlerGuard)
  @SkipThrottle({ [REGISTER_IP_THROTTLER]: true, [RESEND_IP_THROTTLER]: true })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema, identityValidationError))
    body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { email, password } = body;
    const opened = await this.auth.login({ email, password }, readClientContext(req));
    return this.writeSession(res, opened);
  }

  /** CA-7 a CA-10: rota `nimbo_rt`. La borra si la sesión venció o se revocó, nunca ante `REFRESH_INVALID`. */
  @Post('session/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    try {
      const issued = await this.sessions.refresh(
        readCookie(req, REFRESH_COOKIE) ?? '',
        readClientContext(req),
      );
      this.cookies.setRefresh(res, issued.refreshToken, issued.refreshMaxAge);
      return toSessionResponse(issued);
    } catch (error) {
      if (endsSession(error)) {
        this.cookies.clearRefresh(res);
      }
      throw error;
    }
  }

  /** CA-14: siempre `204` y `nimbo_rt` borrada; `nimbo_did` se queda. */
  @Post('session/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.logout(readCookie(req, REFRESH_COOKIE) ?? '');
    this.cookies.clearRefresh(res);
  }

  private async openAfterVerification(
    result: Extract<VerifyEmailResult, { outcome: 'VERIFIED' }>,
    req: Request,
  ): Promise<OpenedSession | null> {
    try {
      return await this.sessions.open(result.user, readClientContext(req), 'verification');
    } catch {
      this.logger.warn({ event: 'identity.verification.session_failed', userId: result.userId });
      return null;
    }
  }

  private writeSession(res: Response, opened: OpenedSession): SessionResponse {
    this.cookies.setRefresh(res, opened.refreshToken, opened.refreshMaxAge);
    if (opened.deviceCookie !== undefined) {
      this.cookies.setDevice(res, opened.deviceCookie);
    }
    return toSessionResponse(opened);
  }
}
