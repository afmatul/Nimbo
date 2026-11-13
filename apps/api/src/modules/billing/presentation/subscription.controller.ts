import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  autoRenewRequestSchema,
  planChangeRequestSchema,
  renewRequestSchema,
  subscribeRequestSchema,
} from '@nimbo/contracts';
import type {
  AutoRenewRequest,
  BillingHistoryResponse,
  PlanChangeRequest,
  PlanChangeResponse,
  SubscriptionView,
  InvoiceDownloadResponse,
  RenewRequest,
  RenewResponse,
  SubscribeRequest,
  SubscribeResponse,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { BillingHistoryService } from '../application/billing-history.service';
import { ManualRenewalService } from '../application/manual-renewal.service';
import { SubscriptionSettingsService } from '../application/subscription-settings.service';
import { SubscriptionService } from '../application/subscription.service';
import { PaymentRejectedError } from '../domain/errors/payment-rejected.error';
import type { PaymentCard } from '../domain/payment-card';

import { toBillingHistoryResponse } from './billing-history.response';
import { billingValidationError, invoiceIdPipe } from './billing-validation';
import { toPaymentReceipt } from './payment-receipt.response';
import { toAdjustedView, toPlanChangeResponse } from './subscription-view.response';

/** El CVC no pasa de aquí (009 RN-9): el dominio recibe solo número y vencimiento. */
const toPaymentCard = ({ number, expMonth, expYear }: SubscribeRequest['card']): PaymentCard => ({
  number,
  expMonth,
  expYear,
});

/**
 * Suscripción del cliente: contratar, historial y descarga de facturas (spec 009 CA-3 a CA-5, CA-7 y CA-8) y, con la
 * 010, renovar a mano (CA-8 a CA-10, CA-26, CA-28), la renovación automática (CA-6) y el cambio de plan (CA-16 a
 * CA-19, CA-27). Solo `CLIENT`: los roles internos reciben `403` (CA-23) y no pagan ni leen pagos de un cliente. Los
 * cobros validan RN-9, delegan y, si la pasarela rechazó, lanzan el `402` ya fuera de la transacción. El CVC no pasa de
 * aquí; el NIT va a la factura.
 */
@Roles(Role.CLIENT)
@Controller('billing')
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly history: BillingHistoryService,
    private readonly renewals: ManualRenewalService,
    private readonly settings: SubscriptionSettingsService,
  ) {}

  @Post('subscribe')
  async subscribe(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(subscribeRequestSchema, billingValidationError))
    body: SubscribeRequest,
  ): Promise<SubscribeResponse> {
    const outcome = await this.subscriptions.subscribe(actor, {
      planSlug: body.planSlug,
      card: toPaymentCard(body.card),
      nit: body.nit,
    });
    if (outcome.payment.status === 'rechazada') throw new PaymentRejectedError();
    return toPaymentReceipt(outcome);
  }

  /** 010 CA-8 a CA-11, CA-26, CA-28: renovación manual con la tarjeta presente; el `402`, después del commit. */
  @Post('renew')
  async renew(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(renewRequestSchema, billingValidationError))
    body: RenewRequest,
  ): Promise<RenewResponse> {
    const outcome = await this.renewals.renew(actor, {
      card: toPaymentCard(body.card),
      nit: body.nit,
      expectedExpiresAt: new Date(body.expectedExpiresAt),
    });
    if (outcome.payment.status === 'rechazada') throw new PaymentRejectedError();
    return toPaymentReceipt(outcome);
  }

  /** 010 CA-6: enciende o apaga la renovación automática. */
  @Put('subscription/auto-renew')
  async setAutoRenew(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(autoRenewRequestSchema, billingValidationError))
    body: AutoRenewRequest,
  ): Promise<SubscriptionView> {
    return toAdjustedView(await this.settings.setAutoRenew(actor, body.enabled));
  }

  /** 010 CA-16 a CA-18, CA-27: programa el plan del siguiente ciclo y responde desde cuándo rige. */
  @Put('subscription/plan-change')
  async scheduleChange(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(planChangeRequestSchema, billingValidationError))
    body: PlanChangeRequest,
  ): Promise<PlanChangeResponse> {
    return toPlanChangeResponse(await this.settings.scheduleChange(actor, body.planSlug));
  }

  /** 010 CA-19: cancela el cambio programado. */
  @Delete('subscription/plan-change')
  async cancelChange(@CurrentActor() actor: Actor): Promise<SubscriptionView> {
    return toAdjustedView(await this.settings.cancelChange(actor));
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
