import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from '../modules/audit';
import { InitialAdminBootstrapper } from '../modules/backoffice';
import { IDENTITY_THROTTLERS, IdentityModule } from '../modules/identity';
import { EnvModule, SharedModule } from '../shared';
import type { Env } from '../shared';

/**
 * Raíz de composición del comando `admin:bootstrap` (011 CA-7): contexto Nest sin HTTP, como `migrate.ts` es un
 * proceso aparte. Compone solo lo que el alta inicial usa: `identity` (con los eventos en proceso y los *throttlers*
 * que su módulo exige, como `AppModule`), la auditoría y `InitialAdminBootstrapper`; no carga el resto del backoffice.
 */
@Module({})
export class BootstrapAdminModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: BootstrapAdminModule,
      imports: [
        EnvModule.forRoot(env),
        SharedModule,
        EventEmitterModule.forRoot(),
        ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] }),
        IdentityModule.forRoot(env),
        AuditModule,
      ],
      providers: [InitialAdminBootstrapper],
    };
  }
}
