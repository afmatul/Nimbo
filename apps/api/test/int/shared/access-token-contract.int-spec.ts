import { I_ACCESS_TOKEN_VERIFIER, I_CLOCK } from '../../../src/shared';
import type { FixedClock, IAccessTokenVerifier } from '../../../src/shared';
import {
  describeAccessTokenHttpContract,
  describeAccessTokenVerifierContract,
} from '../../support/access-token-verifier.contract';
import type { AccessTokenHttpContractSubject } from '../../support/access-token-verifier.contract';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

/**
 * Suite de contrato única (003 T-14, ADR-0017) con `TestAccessTokenVerifier` + `TestJwtStrategy` y `passport-jwt`
 * real detrás de los guards globales. 002-PR-2 la reutiliza con su verificador y su estrategia (002 CA-26).
 */
describe('IAccessTokenVerifier de prueba con TestJwtStrategy', () => {
  let testApp: TestApp | undefined;
  let current: AccessTokenHttpContractSubject | undefined;

  beforeAll(async () => {
    testApp = await createTestApp();
    const clock = testApp.app.get<FixedClock>(I_CLOCK);
    current = {
      server: testApp.app.getHttpServer(),
      verifier: testApp.app.get<IAccessTokenVerifier>(I_ACCESS_TOKEN_VERIFIER),
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
