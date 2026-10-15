import { Body, Controller, Post } from '@nestjs/common';
import { breakdown, subscribeRequestSchema } from '@nimbo/contracts';
import type { SubscribeRequest, SubscribeResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { SubscriptionService } from '../application/subscription.service';
import type { SubscribeOutcome } from '../application/subscription.service';
import { PaymentRejectedError } from '../domain/errors/payment-rejected.error';

import { billingValidationError } from './billing-validation';

/** Lista blanca del contrato (CA-3): referencia, plan, vencimiento y el desglose de RN-2 en centavos. */
const toSubscribeResponse = ({
  payment,
  plan,
  subscription,
}: SubscribeOutcome): SubscribeResponse => {
  if (subscription.expiresAt === null) throw new Error('Un plan de pago siempre vence (RN-4).');
  return {
    reference: payment.reference,
    plan: { slug: plan.slug, name: plan.name },
    expiresAt: subscription.expiresAt.toISOString(),
    amounts: breakdown(plan.priceCents),
  };
};

/**
 * Cobro del plan de pago (spec 009 CA-3 a CA-5). Solo `CLIENT`: los roles internos reciben `403` y no pagan por un
 * cliente. Valida RN-9, delega y, si la pasarela rechazó, lanza el `402` ya fuera de la transacción (B-3). El NIT se
 * guarda en la factura (T-06).
 */
@Roles(Role.CLIENT)
@Controller('billing')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Post('subscribe')
  async subscribe(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(subscribeRequestSchema, billingValidationError))
    body: SubscribeRequest,
  ): Promise<SubscribeResponse> {
    const { number, expMonth, expYear } = body.card;
    const outcome = await this.subscriptions.subscribe(actor, {
      planSlug: body.planSlug,
      card: { number, expMonth, expYear },
    });
    if (outcome.payment.status === 'rechazada') throw new PaymentRejectedError();
    return toSubscribeResponse(outcome);
  }
}
