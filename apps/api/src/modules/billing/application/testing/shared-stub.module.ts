import { Global, Module } from '@nestjs/common';

import { I_TRANSACTION_RUNNER, TransactionContext } from '../../../../shared';

/**
 * Lo que `SharedModule` (global) publica en la app y `BillingModule` da por hecho (alta Personal, 009). Solo para
 * pruebas que componen `BillingModule` sin base de datos.
 */
@Global()
@Module({
  providers: [
    { provide: I_TRANSACTION_RUNNER, useValue: {} },
    { provide: TransactionContext, useValue: {} },
  ],
  exports: [I_TRANSACTION_RUNNER, TransactionContext],
})
export class SharedStubModule {}
