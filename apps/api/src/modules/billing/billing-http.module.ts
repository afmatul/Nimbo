import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';
import { AuditModule } from '../audit';
import { IdentityReadersModule } from '../identity';
import { NotificationsModule } from '../notifications';

import { BillingHistoryService } from './application/billing-history.service';
import { InvoiceIssuer } from './application/invoice-issuer';
import { ManualRenewalService } from './application/manual-renewal.service';
import { PaymentAttemptLimiter } from './application/payment-attempt-limiter';
import { I_BILLING_HISTORY_READER } from './application/ports/i-billing-history.reader.port';
import { I_INVOICE_GENERATOR } from './application/ports/i-invoice-generator.port';
import { RENEWAL_REMINDER_DAYS } from './application/renewal-config';
import { SubscriptionCheckout } from './application/subscription-checkout';
import { SubscriptionSettingsService } from './application/subscription-settings.service';
import { SubscriptionService } from './application/subscription.service';
import { BillingChargingModule } from './billing-charging.module';
import { BillingModule } from './billing.module';
import { PdfInvoiceGenerator } from './infrastructure/adapters/pdf-invoice-generator';
import { SqlBillingHistoryReader } from './infrastructure/persistence/sql-billing-history.reader';
import { PlansController } from './presentation/plans.controller';
import { SubscriptionController } from './presentation/subscription.controller';

/** Variables del `api` que `billing` usa (plan 010 §2): los días del estado «por vencer» (RN-8). */
export type BillingHttpEnv = Pick<Env, 'RENEWAL_REMINDER_DAYS'>;

/**
 * Parte de `billing` que solo corre en el `api` (specs 008, 009 y 010): el catálogo público (`GET /billing/plans`), la
 * contratación (`POST /billing/subscribe`), la renovación manual y los ajustes de la suscripción (010), la emisión del
 * PDF y del aviso (`INotifier`) después del commit, y el historial con la descarga de facturas; el cobro mismo viene de
 * `BillingChargingModule`. El `worker` no publica estas rutas. Importa de forma explícita la **misma** instancia de
 * `StorageModule.forRoot(env)` que monta `AppModule` (ampliación de la decisión 1, sin módulo global): con Nest 11,
 * otra llamada a `forRoot` crearía un segundo `storage` con sus rutas duplicadas.
 */
@Module({})
export class BillingHttpModule {
  static forRoot(env: BillingHttpEnv, storage: DynamicModule): DynamicModule {
    return {
      module: BillingHttpModule,
      imports: [
        BillingModule,
        BillingChargingModule,
        AuditModule,
        IdentityReadersModule,
        NotificationsModule,
        storage,
      ],
      controllers: [PlansController, SubscriptionController],
      providers: [
        { provide: I_INVOICE_GENERATOR, useClass: PdfInvoiceGenerator },
        { provide: I_BILLING_HISTORY_READER, useClass: SqlBillingHistoryReader },
        BillingHistoryService,
        InvoiceIssuer,
        PaymentAttemptLimiter,
        SubscriptionCheckout,
        SubscriptionService,
        ManualRenewalService,
        { provide: RENEWAL_REMINDER_DAYS, useValue: env.RENEWAL_REMINDER_DAYS },
        SubscriptionSettingsService,
      ],
    };
  }
}
