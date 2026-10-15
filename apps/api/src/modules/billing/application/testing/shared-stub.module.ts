import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  FixedClock,
  I_CLOCK,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  TransactionContext,
} from '../../../../shared';

/**
 * Lo que `SharedModule` y el logger (globales) publican en la app y `BillingModule` da por hecho (alta Personal, cobro y
 * suscripción, 009). Solo para pruebas que componen `BillingModule` sin base de datos ni Redis.
 */
@Global()
@Module({
  providers: [
    { provide: I_TRANSACTION_RUNNER, useValue: {} },
    { provide: TransactionContext, useValue: {} },
    { provide: I_CLOCK, useValue: new FixedClock(new Date('2026-10-14T00:00:00.000Z')) },
    { provide: I_RATE_LIMITER, useValue: {} },
    { provide: PinoLogger, useValue: {} },
  ],
  exports: [I_TRANSACTION_RUNNER, TransactionContext, I_CLOCK, I_RATE_LIMITER, PinoLogger],
})
export class SharedStubModule {}
