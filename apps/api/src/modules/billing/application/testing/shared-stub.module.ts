import { Global, Module } from '@nestjs/common';

import { FixedClock, I_CLOCK, I_TRANSACTION_RUNNER, TransactionContext } from '../../../../shared';

/**
 * Lo que `SharedModule` (global) publica en la app y `BillingModule` da por hecho (alta Personal y cobro, 009). Solo
 * para pruebas que componen `BillingModule` sin base de datos.
 */
@Global()
@Module({
  providers: [
    { provide: I_TRANSACTION_RUNNER, useValue: {} },
    { provide: TransactionContext, useValue: {} },
    { provide: I_CLOCK, useValue: new FixedClock(new Date('2026-10-14T00:00:00.000Z')) },
  ],
  exports: [I_TRANSACTION_RUNNER, TransactionContext, I_CLOCK],
})
export class SharedStubModule {}
