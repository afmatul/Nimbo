import { IDENTITY_CONFIG } from '../../../src/modules/identity/application/identity-config';
import type { IdentityConfig } from '../../../src/modules/identity/application/identity-config';
import { I_TOKEN_SERVICE } from '../../../src/modules/identity/application/ports/i-token-service.port';
import { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { I_ACCESS_TOKEN_VERIFIER } from '../../../src/shared';
import { accessTokenStrategiesIn } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { createIdentityTestApp } from './identity-test-app';

/** Composición de `IdentityModule` (plan §6.8, CA-26): el puerto de 003 lo implementa `JwtTokenService`. */
describe('IdentityModule: composición (CA-26)', () => {
  let testApp: TestApp | undefined;

  afterEach(async () => {
    await testApp?.close();
    testApp = undefined;
  });

  it('CA-26: `I_ACCESS_TOKEN_VERIFIER` e `ITokenService` son la misma instancia de `JwtTokenService`', async () => {
    testApp = await createIdentityTestApp();
    const { app } = testApp;
    const service = app.get(JwtTokenService);

    expect(service).toBeInstanceOf(JwtTokenService);
    expect(app.get(I_ACCESS_TOKEN_VERIFIER)).toBe(service);
    expect(app.get(I_TOKEN_SERVICE)).toBe(service);
  });

  it('CA-26: registra una sola estrategia con el nombre `ACCESS_TOKEN_STRATEGY`', async () => {
    testApp = await createIdentityTestApp();

    expect(accessTokenStrategiesIn(testApp.app)).toBe(1);
  });

  it.each([
    ['local', false],
    ['staging', true],
    ['production', true],
  ] as const)('CA-1: con `APP_ENV=%s`, `cookieSecure` es %s', async (appEnv, secure) => {
    testApp = await createIdentityTestApp({ identityEnv: { APP_ENV: appEnv } });

    expect(testApp.app.get<IdentityConfig>(IDENTITY_CONFIG).cookieSecure).toBe(secure);
  });
});
