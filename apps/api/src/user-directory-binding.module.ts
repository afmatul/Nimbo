import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { I_USER_DIRECTORY } from './modules/editing';
import { UserDirectoryAdapter } from './modules/identity';

/** Módulo que exporta `UserDirectoryAdapter` (`IdentityModule.forRoot(env)` en la app; la misma instancia). */
export type UserDirectorySourceModule = DynamicModule;

/**
 * Raíz de composición de `IUserDirectory` (016, DF-74): `editing` lo declara y no conoce a `identity`, así que el
 * enlace vive aquí, global, como `PlanLimitsBindingModule` con `billing`. Recibe la misma instancia de `IdentityModule`
 * que la raíz para no registrar otra vez sus controladores.
 */
@Global()
@Module({})
export class UserDirectoryBindingModule {
  static forRoot(identity: UserDirectorySourceModule): DynamicModule {
    return {
      module: UserDirectoryBindingModule,
      imports: [identity],
      providers: [{ provide: I_USER_DIRECTORY, useExisting: UserDirectoryAdapter }],
      exports: [I_USER_DIRECTORY],
    };
  }
}
