import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { SharedEnvBase } from './env.schema';

/** Token del entorno validado (`SharedEnvBase`). Los módulos de negocio reciben su configuración por puertos. */
export const ENV = Symbol('ENV');

/**
 * Publica bajo `ENV` el entorno que la raíz de composición ya validó con su propio esquema
 * (`apiEnvSchema` o `workerEnvSchema`): un solo punto de validación por proceso y ninguna lectura de
 * `process.env` al importar `shared` (CA-10). Global porque `SharedModule` no recibe parámetros
 * (plan 000 §11.3 cambio 3) y sus piezas internas lo inyectan desde módulos dinámicos.
 */
@Global()
@Module({})
export class EnvModule {
  static forRoot(env: SharedEnvBase): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
