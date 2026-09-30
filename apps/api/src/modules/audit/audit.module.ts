import { Module } from '@nestjs/common';

import { I_AUDIT_LOGGER } from './application/i-audit-logger.port';
import { LogAuditLogger } from './infrastructure/log-audit-logger';

/** Publica `I_AUDIT_LOGGER`. `I_CLOCK` y `PinoLogger` son globales en la app. Hasta 004, el adaptador escribe en Pino. */
@Module({
  providers: [{ provide: I_AUDIT_LOGGER, useClass: LogAuditLogger }],
  exports: [I_AUDIT_LOGGER],
})
export class AuditModule {}
