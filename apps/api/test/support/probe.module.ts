import { Module } from '@nestjs/common';

import { FixedClock, I_ACCESS_TOKEN_VERIFIER, I_CLOCK } from '../../src/shared';

import { ProbeCalls, ProbeController } from './probe.controller';
import { TestAccessTokenVerifier } from './test-access-token-verifier';
import { TestJwtStrategy } from './test-jwt-strategy';

/** Hora de las apps de prueba de 003; la prueba la mueve con `app.get(I_CLOCK)`. */
export const PROBE_CLOCK_START = new Date('2026-09-27T12:00:00.000Z');

/**
 * Sondas de autorización (003 §5, §6.6): el controlador, `TestJwtStrategy` registrada como `ACCESS_TOKEN_STRATEGY` y
 * `TestAccessTokenVerifier` detrás de `I_ACCESS_TOKEN_VERIFIER`, con un `FixedClock` propio. No importa
 * `IdentityModule`: una app de prueba registra una sola estrategia.
 */
@Module({
  controllers: [ProbeController],
  providers: [
    ProbeCalls,
    TestJwtStrategy,
    { provide: I_CLOCK, useFactory: (): FixedClock => new FixedClock(PROBE_CLOCK_START) },
    { provide: I_ACCESS_TOKEN_VERIFIER, useClass: TestAccessTokenVerifier },
  ],
})
export class ProbeModule {}
