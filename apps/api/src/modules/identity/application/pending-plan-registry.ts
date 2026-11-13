import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';

import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';

/**
 * Fachada para `billing` (registro con plan; clase sin interfaz, DF-04): descarta el plan de pago que el actor eligió
 * al registrarse, una vez contratado o si no es contratable. Escribe solo sobre la **propia** cuenta del actor
 * (metadatos propios que no devuelven nodos, `architecture.md` §6) y se une a la transacción del llamador.
 */
@Injectable()
export class PendingPlanRegistry {
  constructor(@Inject(I_USER_REPOSITORY) private readonly users: IUserRepository) {}

  clear(actor: Actor): Promise<void> {
    return this.users.clearPendingPlan(actor.id);
  }
}
