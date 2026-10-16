import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AuditModule } from '../audit';

import { InternalActionService } from './application/internal-action.service';
import { SupportService } from './application/support.service';
import { ClientFilesController } from './presentation/client-files.controller';

/**
 * Módulo `backoffice` (M8, 011 plan §2): orquesta fachadas de otros módulos, sin reglas ni tablas propias.
 * `forRoot(identity, storage)` recibe **los mismos** `DynamicModule` que la raíz obtuvo de `IdentityModule.forRoot(env)`
 * y `StorageModule.forRoot(env)`: Nest identifica los módulos dinámicos por referencia, y llamar de nuevo a `forRoot`
 * crearía otra instancia de cada uno con sus rutas (y, en `identity`, su estrategia JWT) duplicadas. `SharedModule`
 * (global) aporta las transacciones.
 */
@Module({})
export class BackofficeModule {
  static forRoot(identity: DynamicModule, storage: DynamicModule): DynamicModule {
    return {
      module: BackofficeModule,
      imports: [identity, storage, AuditModule],
      controllers: [ClientFilesController],
      providers: [InternalActionService, SupportService],
    };
  }
}
