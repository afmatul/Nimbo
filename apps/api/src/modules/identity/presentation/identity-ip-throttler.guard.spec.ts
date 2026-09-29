import { Catch, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { REGISTRATIONS_PER_IP_PER_HOUR, RESENDS_PER_IP_PER_HOUR } from '@nimbo/contracts';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';

import { IdentityTooManyRequestsError } from '../domain/errors';

import {
  IDENTITY_THROTTLERS,
  IdentityIpThrottlerGuard,
  REGISTER_IP_THROTTLER,
  RESEND_IP_THROTTLER,
} from './identity-ip-throttler.guard';

const LIMIT = 2;
const TTL_MS = 3_600_000;
const SECONDS_PER_HOUR = 3600;
const RATE_LIMIT_HEADER = /^x-ratelimit-/i;
const THROTTLER_RETRY_AFTER_HEADER = /^retry-after-/i;

@Controller('limited')
class LimitedController {
  @Post()
  @HttpCode(202)
  @UseGuards(IdentityIpThrottlerGuard)
  accept(): { status: string } {
    return { status: 'accepted' };
  }
}

/** Captura lo que lanza el guard; la traducción a HTTP (`Retry-After`) es de `DomainExceptionFilter` (T-08). */
@Catch()
class CapturingFilter implements ExceptionFilter {
  readonly caught: unknown[] = [];

  catch(exception: unknown, host: ArgumentsHost): void {
    this.caught.push(exception);
    host.switchToHttp().getResponse<Response>().status(429).json({});
  }
}

const throttlerHeaders = (headers: Record<string, unknown>): string[] =>
  Object.keys(headers).filter(
    (name) => RATE_LIMIT_HEADER.test(name) || THROTTLER_RETRY_AFTER_HEADER.test(name),
  );

describe('IdentityIpThrottlerGuard (ADR-0017, plan §6.5)', () => {
  let app: INestApplication;
  let filter: CapturingFilter;
  const logger = { info: jest.fn(), warn: jest.fn() };

  const startApp = async (throttlerName: string): Promise<void> => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: throttlerName, ttl: TTL_MS, limit: LIMIT }],
        }),
      ],
      controllers: [LimitedController],
      providers: [{ provide: PinoLogger, useValue: logger }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    filter = new CapturingFilter();
    app.useGlobalFilters(filter);
    await app.init();
  };

  beforeEach(async () => {
    logger.info.mockReset();
    logger.warn.mockReset();
    await startApp(REGISTER_IP_THROTTLER);
  });

  afterEach(async () => {
    await app.close();
  });

  const post = () => request(app.getHttpServer()).post('/limited');

  it('CA-15: deja pasar hasta el límite de `register-ip` sin cabeceras `X-RateLimit-*`', async () => {
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      const response = await post();

      expect(response.status).toBe(202);
      expect(throttlerHeaders(response.headers)).toEqual([]);
    }
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('CA-15: al superar el límite lanza `IdentityTooManyRequestsError` con ámbito `ip` y la espera del throttler', async () => {
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await post();
    }

    const response = await post();

    expect(response.status).toBe(429);
    expect(throttlerHeaders(response.headers)).toEqual([]);
    expect(filter.caught).toHaveLength(1);
    const error = filter.caught[0];
    expect(error).toBeInstanceOf(IdentityTooManyRequestsError);
    const { scope, retryAfterSeconds } = error as IdentityTooManyRequestsError;
    expect(scope).toBe('ip');
    expect(retryAfterSeconds).toBeGreaterThan(SECONDS_PER_HOUR - 60);
    expect(retryAfterSeconds).toBeLessThanOrEqual(SECONDS_PER_HOUR);
  });

  it('CA-15: registra `identity.rate_limited` con ámbito `ip` y la espera, sin la IP', async () => {
    for (let attempt = 1; attempt <= LIMIT + 1; attempt += 1) {
      await post();
    }

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [payload] = logger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({
      event: 'identity.rate_limited',
      scope: 'ip',
      retryAfterSeconds: (filter.caught[0] as IdentityTooManyRequestsError).retryAfterSeconds,
    });
    expect(JSON.stringify(payload)).not.toMatch(/127\.0\.0\.1|::1|::ffff/);
  });

  it('CA-15: `resend-ip` también se traduce a `IdentityTooManyRequestsError` con ámbito `ip` (SEC-1)', async () => {
    await app.close();
    await startApp(RESEND_IP_THROTTLER);
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      await post().expect(202);
    }

    const response = await post();

    expect(response.status).toBe(429);
    expect(throttlerHeaders(response.headers)).toEqual([]);
    expect(filter.caught[0]).toBeInstanceOf(IdentityTooManyRequestsError);
    expect((filter.caught[0] as IdentityTooManyRequestsError).scope).toBe('ip');
  });

  it('CA-15: `IDENTITY_THROTTLERS` define `register-ip` y `resend-ip` por hora con sus límites de contracts', () => {
    expect(IDENTITY_THROTTLERS).toEqual([
      { name: REGISTER_IP_THROTTLER, ttl: TTL_MS, limit: REGISTRATIONS_PER_IP_PER_HOUR },
      { name: RESEND_IP_THROTTLER, ttl: TTL_MS, limit: RESENDS_PER_IP_PER_HOUR },
    ]);
  });
});
