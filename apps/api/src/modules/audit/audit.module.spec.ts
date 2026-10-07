import { Global, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';

import { FixedClock, I_CLOCK, I_TRANSACTION_RUNNER, TransactionContext } from '../../shared';

import { AuditService } from './application/audit.service';
import type { IAuditLogger } from './application/i-audit-logger.port';
import { I_AUDIT_LOGGER } from './application/i-audit-logger.port';
import { AuditModule } from './audit.module';

/** Sustituye a los proveedores globales de la app que `AuditModule` da por hechos. */
@Global()
@Module({
  providers: [
    { provide: I_CLOCK, useValue: new FixedClock(new Date('2026-10-05T00:00:00.000Z')) },
    { provide: PinoLogger, useValue: { info: jest.fn(), error: jest.fn() } },
    { provide: I_TRANSACTION_RUNNER, useValue: { run: jest.fn(), withActor: jest.fn() } },
    { provide: TransactionContext, useValue: {} },
  ],
  exports: [I_CLOCK, PinoLogger, I_TRANSACTION_RUNNER, TransactionContext],
})
class GlobalTestProvidersModule {}

describe('AuditModule', () => {
  it('CA-2: enlaza `I_AUDIT_LOGGER` con la misma instancia de `AuditService` y lo exporta', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GlobalTestProvidersModule, AuditModule],
    }).compile();

    const auditLogger = moduleRef.get<IAuditLogger>(I_AUDIT_LOGGER);

    expect(auditLogger).toBeInstanceOf(AuditService);
    expect(auditLogger).toBe(moduleRef.get(AuditService));
    await moduleRef.close();
  });

  it('R-6: no declara controladores; las rutas viven en `AuditHttpModule`, que el `worker` no carga', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuditModule)).toBeUndefined();
  });
});
