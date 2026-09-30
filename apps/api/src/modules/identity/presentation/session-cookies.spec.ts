import { Controller, Get, Res } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';

import { DEVICE_COOKIE, REFRESH_COOKIE, readCookie, SessionCookies } from './session-cookies';

const REFRESH_VALUE =
  '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';
const DEVICE_VALUE = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const SIX_DAYS_MS = 6 * 86_400_000;
const SIX_DAYS_S = 6 * 86_400;
const YEAR_S = 365 * 86_400;

const cookiesFor = (secure: boolean) => {
  @Controller()
  class CookieController {
    private readonly cookies = new SessionCookies(secure);

    @Get('refresh')
    refresh(@Res({ passthrough: true }) res: Response): void {
      this.cookies.setRefresh(res, REFRESH_VALUE, SIX_DAYS_MS);
    }

    @Get('device')
    device(@Res({ passthrough: true }) res: Response): void {
      this.cookies.setDevice(res, DEVICE_VALUE);
    }

    @Get('clear')
    clear(@Res({ passthrough: true }) res: Response): void {
      this.cookies.clearRefresh(res);
    }
  }
  return CookieController;
};

const setCookieOf = (headers: Record<string, unknown>): string => {
  const values = headers['set-cookie'] as string[] | undefined;
  expect(values).toHaveLength(1);
  return (values ?? [])[0] ?? '';
};

const attributes = (cookie: string): string[] =>
  cookie.split('; ').map((part) => part.toLowerCase());

describe('SessionCookies (plan §6.5, DT-2)', () => {
  let app: INestApplication;

  const start = async (secure: boolean): Promise<void> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [cookiesFor(secure)],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  };

  afterEach(async () => {
    await app.close();
  });

  describe('en local (`cookieSecure = false`)', () => {
    beforeEach(() => start(false));

    it('CA-1: `nimbo_rt` es HttpOnly, SameSite=Strict, Path=/api/v1/auth/session, con el Max-Age recibido y sin Secure', async () => {
      const cookie = setCookieOf((await request(app.getHttpServer()).get('/refresh')).headers);
      const parts = attributes(cookie);

      expect(cookie.startsWith(`${REFRESH_COOKIE}=${REFRESH_VALUE};`)).toBe(true);
      expect(parts).toEqual(
        expect.arrayContaining([
          'httponly',
          'samesite=strict',
          'path=/api/v1/auth/session',
          `max-age=${String(SIX_DAYS_S)}`,
        ]),
      );
      expect(parts).not.toContain('secure');
    });

    it('CA-17: `nimbo_did` es HttpOnly, SameSite=Strict, Path=/api/v1/auth y dura 365 días', async () => {
      const cookie = setCookieOf((await request(app.getHttpServer()).get('/device')).headers);

      expect(cookie.startsWith(`${DEVICE_COOKIE}=${DEVICE_VALUE};`)).toBe(true);
      expect(attributes(cookie)).toEqual(
        expect.arrayContaining([
          'httponly',
          'samesite=strict',
          'path=/api/v1/auth',
          `max-age=${String(YEAR_S)}`,
        ]),
      );
    });

    it('CA-8, CA-14: `clearRefresh` borra `nimbo_rt` con la misma ruta', async () => {
      const cookie = setCookieOf((await request(app.getHttpServer()).get('/clear')).headers);
      const parts = attributes(cookie);

      expect(cookie.startsWith(`${REFRESH_COOKIE}=;`)).toBe(true);
      expect(parts).toContain('path=/api/v1/auth/session');
      expect(parts.some((part) => part.startsWith('expires=thu, 01 jan 1970'))).toBe(true);
    });
  });

  describe('en staging o producción (`cookieSecure = true`)', () => {
    beforeEach(() => start(true));

    it.each(['/refresh', '/device', '/clear'])('CA-1: %s lleva Secure', async (path) => {
      const cookie = setCookieOf((await request(app.getHttpServer()).get(path)).headers);

      expect(attributes(cookie)).toContain('secure');
    });
  });
});

describe('readCookie (DT-9)', () => {
  const withCookie = (cookie?: string) => ({ headers: cookie === undefined ? {} : { cookie } });

  it('CA-1: lee el valor entre varias cookies', () => {
    const req = withCookie(
      `a=1; ${REFRESH_COOKIE}=${REFRESH_VALUE}; ${DEVICE_COOKIE}=${DEVICE_VALUE}`,
    );

    expect(readCookie(req, REFRESH_COOKIE)).toBe(REFRESH_VALUE);
    expect(readCookie(req, DEVICE_COOKIE)).toBe(DEVICE_VALUE);
  });

  it.each([
    ['sin cabecera Cookie', undefined],
    ['sin la cookie', 'a=1; b=2'],
    ['repetida', `${DEVICE_COOKIE}=${DEVICE_VALUE}; ${DEVICE_COOKIE}=${DEVICE_VALUE}`],
    ['vacía', `${DEVICE_COOKIE}=`],
    ['con caracteres fuera de base64url', `${DEVICE_COOKIE}=abc%20def`],
    ['con un nombre que solo la contiene', `x${DEVICE_COOKIE}=${DEVICE_VALUE}`],
  ])('CA-17: devuelve `undefined` %s', (_case, cookie) => {
    expect(readCookie(withCookie(cookie), DEVICE_COOKIE)).toBeUndefined();
  });
});
