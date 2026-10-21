import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AuditModule } from '../audit';
import { BillingModule } from '../billing';

import { AdminService } from './application/admin.service';
import { BackofficeRateLimiter } from './application/backoffice-rate-limiter';
import { CatalogAdminService } from './application/catalog-admin.service';
import { InternalActionService } from './application/internal-action.service';
import { MetricsService } from './application/metrics.service';
import { SupportService } from './application/support.service';
import { AccountsController } from './presentation/accounts.controller';
import { ClientFilesController } from './presentation/client-files.controller';
import { MetricsController } from './presentation/metrics.controller';
import { PlansController } from './presentation/plans.controller';

/**
 * Módulo `backoffice` (M8, 011 plan §2): orquesta fachadas de otros módulos, sin reglas ni tablas propias.
 * `forRoot(identity, storage)` recibe **los mismos** `DynamicModule` que la raíz obtuvo de `IdentityModule.forRoot(env)`
 * y `StorageModule.forRoot(env)`: Nest identifica los módulos dinámicos por referencia, y llamar de nuevo a `forRoot`
 * crearía otra instancia de cada uno con sus rutas (y, en `identity`, su estrategia JWT) duplicadas. `SharedModule`
 * (global) aporta las transacciones; `BillingModule` (estático, sin rutas) aporta `SubscriptionAdministration` y `PlanCatalogService`.
 */
@Module({})
export class BackofficeModule {
  static forRoot(identity: DynamicModule, storage: DynamicModule): DynamicModule {
    return {
      module: BackofficeModule,
      imports: [identity, storage, AuditModule, BillingModule],
      controllers: [ClientFilesController, AccountsController, MetricsController, PlansController],
      providers: [
        InternalActionService,
        BackofficeRateLimiter,
        SupportService,
        AdminService,
        MetricsService,
        CatalogAdminService,
      ],
    };
  }
}
