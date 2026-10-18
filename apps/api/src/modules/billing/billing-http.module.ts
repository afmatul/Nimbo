import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { IdentityReadersModule } from '../identity';
import { NotificationsModule } from '../notifications';

import { BillingHistoryService } from './application/billing-history.service';
import { InvoiceIssuer } from './application/invoice-issuer';
import { InvoiceService } from './application/invoice.service';
import { PaymentService } from './application/payment.service';
import { I_BILLING_HISTORY_READER } from './application/ports/i-billing-history.reader.port';
import { I_INVOICE_GENERATOR } from './application/ports/i-invoice-generator.port';
import { I_PAYMENT_GATEWAY } from './application/ports/i-payment-gateway.port';
import { I_PAYMENT_REPOSITORY } from './application/ports/i-payment-repository.port';
import { SubscriptionCheckout } from './application/subscription-checkout';
import { SubscriptionService } from './application/subscription.service';
import { BillingModule } from './billing.module';
import { PdfInvoiceGenerator } from './infrastructure/adapters/pdf-invoice-generator';
import { SimulatedPaymentGateway } from './infrastructure/adapters/simulated-payment-gateway';
import { SqlBillingHistoryReader } from './infrastructure/persistence/sql-billing-history.reader';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/typeorm-payment.repository';
import { PlansController } from './presentation/plans.controller';
import { SubscriptionController } from './presentation/subscription.controller';

/**
 * Parte de `billing` que solo corre en el `api` (specs 008 y 009): el catálogo público (`GET /billing/plans`), el cobro
 * (`POST /billing/subscribe`), la emisión del PDF y del aviso (`INotifier`) después del commit, y el historial con la
 * descarga de facturas; el `worker` no publica estas rutas. Importa de forma explícita la **misma** instancia de
 * `StorageModule.forRoot(env)` que monta `AppModule` (ampliación de la decisión 1, sin módulo global): con Nest 11,
 * otra llamada a `forRoot` crearía un segundo `storage` con sus rutas duplicadas.
 */
@Module({})
export class BillingHttpModule {
  static forRoot(storage: DynamicModule): DynamicModule {
    return {
      module: BillingHttpModule,
      imports: [BillingModule, IdentityReadersModule, NotificationsModule, storage],
      controllers: [PlansController, SubscriptionController],
      providers: [
        { provide: I_INVOICE_GENERATOR, useClass: PdfInvoiceGenerator },
        { provide: I_BILLING_HISTORY_READER, useClass: SqlBillingHistoryReader },
        BillingHistoryService,
        { provide: I_PAYMENT_GATEWAY, useClass: SimulatedPaymentGateway },
        { provide: I_PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
        PaymentService,
        InvoiceService,
        InvoiceIssuer,
        SubscriptionCheckout,
        SubscriptionService,
      ],
    };
  }
}
