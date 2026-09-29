import { FixedClock } from '../../src/shared';

import { describeAccessTokenVerifierContract } from './access-token-verifier.contract';
import { TestAccessTokenVerifier } from './test-access-token-verifier';
import { TestAccessTokens } from './test-access-tokens';

const clock = new FixedClock(new Date('2026-09-27T12:00:00.000Z'));

describe('TestAccessTokenVerifier', () => {
  describeAccessTokenVerifierContract(() => ({
    verifier: new TestAccessTokenVerifier(clock),
    tokens: new TestAccessTokens(clock),
    clock,
  }));
});
