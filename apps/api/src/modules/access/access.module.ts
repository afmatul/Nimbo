import { Module } from '@nestjs/common';

import { I_ACCESS_LEVEL_READER } from './application/i-access-level-reader.port';
import { PermissionResolver } from './application/permission-resolver';
import { SqlAccessLevelReader } from './infrastructure/sql/sql-access-level-reader';

/**
 * M3a (plan 003 §6.5): `PermissionResolver` con el lector SQL detrás de `I_ACCESS_LEVEL_READER`. Solo se exporta el
 * resolvedor; `TransactionContext` llega de `SharedModule` (global).
 */
@Module({
  providers: [
    PermissionResolver,
    { provide: I_ACCESS_LEVEL_READER, useClass: SqlAccessLevelReader },
  ],
  exports: [PermissionResolver],
})
export class AccessModule {}
