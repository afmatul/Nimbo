import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';

import { FixedClock, I_CLOCK } from '../../shared';

import type { IAuditLogger } from './application/i-audit-logger.port';
import { I_AUDIT_LOGGER } from './application/i-audit-logger.port';
import { AuditModule } from './audit.module';
import { LogAuditLogger } from './infrastructure/log-audit-logger';

/** Sustituye a los proveedores globales de la app (`I_CLOCK`, `PinoLogger`) que `AuditModule` da por hechos. */
@Global()
@Module({
  providers: [
    { provide: I_CLOCK, useValue: new FixedClock(new Date('2026-09-29T00:00:00.000Z')) },
    { provide: PinoLogger, useValue: { info: jest.fn(), error: jest.fn() } },
  ],
  exports: [I_CLOCK, PinoLogger],
})
class GlobalTestProvidersModule {}

describe('AuditModule', () => {
  it('CA-20: enlaza `I_AUDIT_LOGGER` con el adaptador provisional y lo exporta', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GlobalTestProvidersModule, AuditModule],
    }).compile();

    const auditLogger = moduleRef.get<IAuditLogger>(I_AUDIT_LOGGER);

    expect(auditLogger).toBeInstanceOf(LogAuditLogger);
    await moduleRef.close();
  });
});
