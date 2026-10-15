'use client';

import {
  BILLING_ERROR_CODES,
  formatGtq,
  type Plan,
  type SubscribeResponse,
} from '@nimbo/contracts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { JSX } from 'react';

import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { messageForCode } from '../../../lib/error-catalog';
import { dayLabel } from '../../../lib/format-date';
import { cn } from '../../../lib/utils';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { usePaymentForm, type PaymentFormState } from '../hooks/use-payment-form';
import type { PaymentField } from '../payment-form-values';

import { PaymentSummary } from './payment-summary';

const FILES_HREF = '/archivos';

export interface PaymentFormProps {
  readonly plan: Plan;
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
}

/** Pantalla de pago (spec 009 §6, mockup `billing/pago/`): formulario o aprobado, y el resumen del plan al lado. */
export function PaymentForm({ plan, apiPublicUrl, authFetch }: PaymentFormProps): JSX.Element {
  const state = usePaymentForm({ planSlug: plan.slug, apiPublicUrl, authFetch });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {state.outcome.kind === 'approved' ? (
        <ApprovedCard payment={state.outcome.payment} />
      ) : (
        <PaymentCard plan={plan} state={state} />
      )}
      <PaymentSummary plan={plan} />
    </div>
  );
}

/** La misma pantalla con la sesión en memoria (`SessionProvider`), para la página. */
export function SessionPaymentForm(props: Omit<PaymentFormProps, 'authFetch'>): JSX.Element {
  const authFetch = useAuthFetch();
  return <PaymentForm {...props} authFetch={authFetch} />;
}

function PaymentCard({
  plan,
  state,
}: {
  readonly plan: Plan;
  readonly state: PaymentFormState;
}): JSX.Element {
  const price = formatGtq(plan.priceCents);
  return (
    <Card className="flex flex-col gap-4 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          Pago <Badge variant="warning">Simulado</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          Es un pago de prueba. No se hace ningún cargo real.
        </p>
      </header>
      <OutcomeAlert state={state} />
      <form
        noValidate
        onSubmit={(event) => void state.submit(event)}
        className="flex flex-col gap-4"
      >
        <PaymentInput
          state={state}
          field="number"
          label="Número de tarjeta"
          autoComplete="cc-number"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <PaymentInput
            state={state}
            field="expiry"
            label="Vencimiento (MM/AA)"
            autoComplete="cc-exp"
          />
          <PaymentInput state={state} field="cvc" label="CVC" autoComplete="cc-csc" />
        </div>
        <PaymentInput state={state} field="nit" label="NIT para la factura" autoComplete="off" />
        <Button type="submit" loading={state.submitting} className="w-full">
          {state.submitting ? 'Procesando pago…' : `Pagar ${price}`}
        </Button>
      </form>
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Tarjetas de prueba: 4242 4242 4242 4242 aprueba · 4000 0000 0000 0002 rechaza.
      </p>
    </Card>
  );
}

function PaymentInput({
  state,
  field,
  label,
  autoComplete,
}: {
  readonly state: PaymentFormState;
  readonly field: PaymentField;
  readonly label: string;
  readonly autoComplete: string;
}): JSX.Element {
  const id = `pago-${field}`;
  const message = state.form.formState.errors[field]?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={field === 'nit' ? 'text' : 'numeric'}
        autoComplete={autoComplete}
        readOnly={state.submitting}
        {...(message === undefined ? {} : { errorMessage: message })}
        {...state.form.register(field)}
      />
    </div>
  );
}

/** Rechazado (CA-4) con su acción («Prueba con otra tarjeta») o error inesperado con el código para soporte. */
function OutcomeAlert({ state }: { readonly state: PaymentFormState }): JSX.Element | null {
  const { outcome } = state;
  if (outcome.kind === 'failed')
    return <ServerErrorAlert title="No pudimos procesar el pago." error={outcome.error} />;
  if (outcome.kind !== 'rejected') return null;
  return (
    <Alert variant="error" className="flex items-start gap-2" data-state="rechazado">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{messageForCode(BILLING_ERROR_CODES.BILLING_PAYMENT_REJECTED)}</p>
    </Alert>
  );
}

/** Aprobado (CA-3): referencia `SIM-`, plan activo y vencimiento. El correo del comprobante llega con la T-08. */
function ApprovedCard({ payment }: { readonly payment: SubscribeResponse }): JSX.Element {
  return (
    <Card className="flex flex-col items-start gap-4 p-6" data-state="aprobado">
      <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-success-foreground" />
      <h1 className="text-xl font-bold text-foreground">Pago aprobado</h1>
      <p className="text-sm text-foreground">Tu plan {payment.plan.name} ya está activo.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Referencia</dt>
        <dd className="font-medium tabular-nums text-foreground">{payment.reference}</dd>
        <dt className="text-muted-foreground">Vence el</dt>
        <dd className="text-foreground">{dayLabel(payment.expiresAt)}</dd>
      </dl>
      <a href={FILES_HREF} className={cn(buttonVariants())}>
        Ir a Mis archivos
      </a>
    </Card>
  );
}
