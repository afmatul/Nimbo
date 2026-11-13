import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { createActor, Role } from '../../../shared';
import { CLIENT_ACCOUNT_VERIFIED } from '../../identity';
import type { ClientAccountVerifiedEvent } from '../../identity';
import { PendingPlanScreening } from '../application/pending-plan-screening';
import { PersonalSubscriptionService } from '../application/personal-subscription.service';

/**
 * Oyente de `identity.client-account-verified` (ADR-0019, spec 009 CA-1): solo delega el alta Personal y la revisión
 * del plan elegido al registrarse. Si falla, el evento en proceso se pierde y la conciliación (T-02) repone la
 * suscripción. `async` lo saca de la respuesta de la verificación;
 * `promisify` deja que `emitAsync` espere al oyente (Nest lo envuelve en una función que no es `async`).
 */
@Injectable()
export class AccountVerifiedListener {
  constructor(
    private readonly personalSubscriptions: PersonalSubscriptionService,
    private readonly pendingPlans: PendingPlanScreening,
  ) {}

  @OnEvent(CLIENT_ACCOUNT_VERIFIED, { async: true, promisify: true })
  async handle(event: ClientAccountVerifiedEvent): Promise<void> {
    const actor = createActor(event.userId, Role.CLIENT);
    await this.personalSubscriptions.subscribe(actor);
    await this.pendingPlans.screen(actor, event.pendingPlanSlug);
  }
}
