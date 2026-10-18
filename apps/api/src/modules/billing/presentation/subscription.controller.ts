import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { subscribeRequestSchema } from '@nimbo/contracts';
import type {
  BillingHistoryResponse,
  InvoiceDownloadResponse,
  SubscribeRequest,
  SubscribeResponse,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { BillingHistoryService } from '../application/billing-history.service';
import { SubscriptionService } from '../application/subscription.service';
import { PaymentRejectedError } from '../domain/errors/payment-rejected.error';

import { toBillingHistoryResponse } from './billing-history.response';
import { billingValidationError, invoiceIdPipe } from './billing-validation';
import { toSubscribeResponse } from './subscribe.response';

/**
 * Cobro, historial y descarga de facturas del cliente (spec 009 CA-3 a CA-5, CA-7 y CA-8). Solo `CLIENT`: los roles
 * internos reciben `403` y no pagan ni leen pagos de un cliente. El cobro valida RN-9, delega y, si la pasarela rechazó,
 * lanza el `402` ya fuera de la transacción (B-3). El CVC no pasa de aquí; el NIT va a la factura (T-06).
 */
@Roles(Role.CLIENT)
@Controller('billing')
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly history: BillingHistoryService,
  ) {}

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
      nit: body.nit,
    });
    if (outcome.payment.status === 'rechazada') throw new PaymentRejectedError();
    return toSubscribeResponse(outcome);
  }

  @Get('history')
  async getHistory(@CurrentActor() actor: Actor): Promise<BillingHistoryResponse> {
    return toBillingHistoryResponse(await this.history.history(actor));
  }

  @Get('invoices/:id/download')
  async download(
    @CurrentActor() actor: Actor,
    @Param('id', invoiceIdPipe()) invoiceId: string,
  ): Promise<InvoiceDownloadResponse> {
    const { url, expiresInSeconds } = await this.history.download(actor, invoiceId);
    return { downloadUrl: url, expiresInSeconds };
  }
}
