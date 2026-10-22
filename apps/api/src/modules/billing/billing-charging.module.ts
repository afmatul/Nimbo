import { Module } from '@nestjs/common';

import { AuditModule } from '../audit';
import { IdentityReadersModule } from '../identity';

import { InvoiceService } from './application/invoice.service';
import { PaymentService } from './application/payment.service';
import { I_PAYMENT_GATEWAY } from './application/ports/i-payment-gateway.port';
import { I_PAYMENT_REPOSITORY } from './application/ports/i-payment-repository.port';
import { RenewalCheckout } from './application/renewal-checkout';
import { BillingModule } from './billing.module';
import { SimulatedPaymentGateway } from './infrastructure/adapters/simulated-payment-gateway';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/typeorm-payment.repository';

/**
 * El cobro de `billing`, común al `api` (contratar y renovar a mano) y al `worker` (renovación automática; spec 010
 * plan §2): la pasarela, `transaccion`, el registro de la factura (con el contacto de `identity`) y `RenewalCheckout`.
 * Sin controladores ni colas.
 */
@Module({
  imports: [BillingModule, AuditModule, IdentityReadersModule],
  providers: [
    { provide: I_PAYMENT_GATEWAY, useClass: SimulatedPaymentGateway },
    { provide: I_PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    PaymentService,
    InvoiceService,
    RenewalCheckout,
  ],
  exports: [PaymentService, InvoiceService, RenewalCheckout, I_PAYMENT_REPOSITORY],
})
export class BillingChargingModule {}
