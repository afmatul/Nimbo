import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AuditModule } from '../audit';

import { InternalActionService } from './application/internal-action.service';

/**
 * Módulo `backoffice` (M8, 011 plan §2): orquesta fachadas de otros módulos, sin reglas ni tablas propias.
 * `forRoot(identity)` recibe **el mismo** `DynamicModule` que la raíz obtuvo de `IdentityModule.forRoot(env)`: Nest
 * identifica los módulos dinámicos por referencia, y llamar de nuevo a `forRoot` crearía otra instancia de `identity`
 * con sus rutas y su estrategia JWT duplicadas. `SharedModule` (global) aporta las transacciones.
 */
@Module({})
export class BackofficeModule {
  static forRoot(identity: DynamicModule): DynamicModule {
    return {
      module: BackofficeModule,
      imports: [identity, AuditModule],
      providers: [InternalActionService],
    };
  }
}
