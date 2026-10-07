import { Module } from '@nestjs/common';

import { AuditService } from './application/audit.service';
import { I_AUDIT_LOGGER } from './application/i-audit-logger.port';
import { I_AUDIT_REPOSITORY } from './application/ports/i-audit.repository.port';
import { TypeOrmAuditRepository } from './infrastructure/persistence/typeorm-audit.repository';

/**
 * Publica `I_AUDIT_LOGGER` sobre `AuditService` (spec 004). `I_CLOCK`, `I_TRANSACTION_RUNNER`, `TransactionContext` y
 * `PinoLogger` son globales en `api` y `worker`. Lo importan `storage` y `storage-worker`; `AuditService` se exporta
 * solo para `AuditHttpModule`. Sin controladores: el `worker` lo carga sin rutas (R-6).
 */
@Module({
  providers: [
    AuditService,
    { provide: I_AUDIT_REPOSITORY, useClass: TypeOrmAuditRepository },
    { provide: I_AUDIT_LOGGER, useExisting: AuditService },
  ],
  exports: [I_AUDIT_LOGGER, AuditService],
})
export class AuditModule {}
