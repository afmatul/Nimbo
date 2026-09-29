import { Module } from '@nestjs/common';

import { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { FixedClock, I_ACCESS_TOKEN_VERIFIER, I_CLOCK } from '../../../src/shared';
import type { IAccessTokenVerifier } from '../../../src/shared';
import {
  describeAccessTokenHttpContract,
  describeAccessTokenVerifierContract,
} from '../../support/access-token-verifier.contract';
import type { AccessTokenHttpContractSubject } from '../../support/access-token-verifier.contract';
import { ProbeCalls, ProbeController } from '../../support/probe.controller';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TEST_ACCESS_TOKEN_SECRET, TestAccessTokens } from '../../support/test-access-tokens';
import type { TestApp } from '../setup/test-app';

import { createIdentityTestApp } from './identity-test-app';

/** Solo la ruta sonda de 003, sin `TestJwtStrategy`: la estrategia es la real de `IdentityModule`. */
@Module({ controllers: [ProbeController], providers: [ProbeCalls] })
class ProbeRoutesModule {}

/**
 * Suite de contrato de 003 con el verificador y la `JwtStrategy` reales (002 CA-26, T-53, T-54). Sin casos propios:
 * `TestAccessTokens` ya emite HS256 con los *claims* de 002 (`sub`, `rol`, `sid`), así que basta con darle a
 * `IdentityModule` la clave de pruebas.
 */
describe('JwtTokenService y JwtStrategy reales contra la suite de contrato de 003 (CA-26)', () => {
  const clock = new FixedClock(PROBE_CLOCK_START);
  let testApp: TestApp | undefined;
  let current: AccessTokenHttpContractSubject | undefined;

  beforeAll(async () => {
    testApp = await createIdentityTestApp({
      identityEnv: { JWT_ACCESS_SECRET: TEST_ACCESS_TOKEN_SECRET },
      modules: [ProbeRoutesModule],
      overrides: [{ provide: I_CLOCK, useValue: clock }],
    });
    const verifier = testApp.app.get<IAccessTokenVerifier>(I_ACCESS_TOKEN_VERIFIER);
    expect(verifier).toBeInstanceOf(JwtTokenService);
    current = {
      server: testApp.app.getHttpServer(),
      verifier,
      tokens: new TestAccessTokens(clock),
      clock,
      logs: testApp.logs,
    };
  });

  afterAll(async () => {
    await testApp?.close();
  });

  const subject = (): AccessTokenHttpContractSubject => {
    if (current === undefined) throw new Error('arnés no inicializado');
    return current;
  };

  describeAccessTokenVerifierContract(subject);
  describeAccessTokenHttpContract(subject);
});
