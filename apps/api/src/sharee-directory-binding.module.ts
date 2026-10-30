import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { ShareeDirectoryAdapter } from './modules/identity';
import { I_SHAREE_DIRECTORY } from './modules/sharing';

/** Módulo que exporta `ShareeDirectoryAdapter` (`IdentityModule.forRoot(env)` en la app; la misma instancia). */
export type ShareeDirectorySourceModule = DynamicModule;

/**
 * Raíz de composición de `IShareeDirectory` (012, DF-84): `sharing` lo declara y no conoce a `identity`, así que el
 * enlace vive aquí, global, como `UserDirectoryBindingModule` con `editing`. Recibe la misma instancia de
 * `IdentityModule` que la raíz para no registrar otra vez sus controladores.
 */
@Global()
@Module({})
export class ShareeDirectoryBindingModule {
  static forRoot(identity: ShareeDirectorySourceModule): DynamicModule {
    return {
      module: ShareeDirectoryBindingModule,
      imports: [identity],
      providers: [{ provide: I_SHAREE_DIRECTORY, useExisting: ShareeDirectoryAdapter }],
      exports: [I_SHAREE_DIRECTORY],
    };
  }
}
