import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerOptions, InjectThrottlerStorage, ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';

import type { IdentityLogger } from '../application/identity-logger';
import { IdentityTooManyRequestsError } from '../domain/errors';
import type { IdentityRateLimitScope } from '../domain/errors';

/** *Throttler* por IP del registro (D-15); `AppModule` lo configura con `REGISTRATIONS_PER_IP_PER_HOUR`. */
export const REGISTER_IP_THROTTLER = 'register-ip';

/** Tabla *throttler* → ámbito de `identity.rate_limited` (plan §6.5). 002-PR-2 agrega `login-ip`. */
const THROTTLER_SCOPES: Readonly<Record<string, IdentityRateLimitScope>> = {
  [REGISTER_IP_THROTTLER]: 'ip',
};

/**
 * `ThrottlerGuard` de `identity` (ADR-0017, plan §6.5, DT-8 del plan 002): se aplica por ruta, nunca global. Al
 * superar un límite lanza `IdentityTooManyRequestsError` (la respuesta de CA-15, con `Retry-After` desde
 * `DomainExceptionFilter`) y registra `identity.rate_limited` sin la IP. Nunca escribe cabeceras `X-RateLimit-*` ni
 * `Retry-After-<throttler>`: romperían «mismas cabeceras» en la respuesta neutra (plan §5).
 */
@Injectable()
export class IdentityIpThrottlerGuard extends ThrottlerGuard {
  /** Qué *throttler* evalúa cada petición; `throwThrottlingException` no lo recibe de la librería. */
  private readonly throttlerInEvaluation = new WeakMap<ExecutionContext, string>();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(PinoLogger) private readonly identityLogger: IdentityLogger,
  ) {
    super(options, storageService, reflector);
  }

  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;
    this.throttlerInEvaluation.set(context, throttler.name ?? '');
    return super.handleRequest({ ...requestProps, throttler: { ...throttler, setHeaders: false } });
  }

  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const scope = this.scopeOf(context);
    const retryAfterSeconds = detail.timeToBlockExpire;
    this.identityLogger.warn({ event: 'identity.rate_limited', scope, retryAfterSeconds });
    return Promise.reject(new IdentityTooManyRequestsError(retryAfterSeconds, scope));
  }

  private scopeOf(context: ExecutionContext): IdentityRateLimitScope {
    const name = this.throttlerInEvaluation.get(context) ?? '';
    const scope = THROTTLER_SCOPES[name];
    if (scope === undefined) {
      throw new Error(`El throttler «${name}» no tiene ámbito en IdentityIpThrottlerGuard.`);
    }
    return scope;
  }
}
