import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { InvoiceIssuer } from './application/invoice-issuer';
import { I_INVOICE_GENERATOR } from './application/ports/i-invoice-generator.port';
import { SubscriptionCheckout } from './application/subscription-checkout';
import { SubscriptionService } from './application/subscription.service';
import { BillingModule } from './billing.module';
import { PdfInvoiceGenerator } from './infrastructure/adapters/pdf-invoice-generator';
import { SubscriptionController } from './presentation/subscription.controller';

/**
 * Parte de `billing` que solo corre en el `api` (spec 009): el cobro (`POST /billing/subscribe`) y la emisión del PDF
 * después del commit. Importa de forma explícita la **misma** instancia de `StorageModule.forRoot(env)` que monta
 * `AppModule` (ampliación de la decisión 1, sin módulo global): con Nest 11, otra llamada a `forRoot` crearía un
 * segundo `storage` con sus rutas duplicadas.
 */
@Module({})
export class BillingHttpModule {
  static forRoot(storage: DynamicModule): DynamicModule {
    return {
      module: BillingHttpModule,
      imports: [BillingModule, storage],
      controllers: [SubscriptionController],
      providers: [
        { provide: I_INVOICE_GENERATOR, useClass: PdfInvoiceGenerator },
        InvoiceIssuer,
        SubscriptionCheckout,
        SubscriptionService,
      ],
    };
  }
}
