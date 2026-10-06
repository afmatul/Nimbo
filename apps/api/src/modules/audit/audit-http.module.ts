import { Module } from '@nestjs/common';

import { AuditModule } from './audit.module';
import { AuditController } from './presentation/audit.controller';

/**
 * Rutas HTTP de `audit` (plan 004 §2, R-6): solo `api` lo registra en `app.module.ts`; el `worker` carga
 * `AuditModule` a través de `storage-worker` y no expone controladores.
 */
@Module({
  imports: [AuditModule],
  controllers: [AuditController],
})
export class AuditHttpModule {}
