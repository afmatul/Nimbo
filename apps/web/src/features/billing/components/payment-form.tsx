'use client';

import {
  BILLING_ERROR_CODES,
  formatGtq,
  type Plan,
  type SubscribeResponse,
} from '@nimbo/contracts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type * as React from 'react';
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
import { cardBrandOf, groupCardNumber, type PaymentField } from '../payment-form-values';

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

function PaymentHeader(): JSX.Element {
  return (
    <header className="space-y-1">
      <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
        Pago <Badge variant="warning">Simulado</Badge>
      </h1>
      <p className="text-sm text-muted-foreground">
        Es un pago de prueba. No se hace ningún cargo real.
      </p>
    </header>
  );
}

/** Número, vencimiento, CVC y NIT (RN-9) y «Pagar», como el mockup. */
function PaymentFields({
  plan,
  state,
}: {
  readonly plan: Plan;
  readonly state: PaymentFormState;
}): JSX.Element {
  return (
    <form noValidate onSubmit={(event) => void state.submit(event)} className="flex flex-col gap-4">
      <CardNumberInput state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PaymentInput
          state={state}
          field="expiry"
          label="Vencimiento"
          autoComplete="cc-exp"
          placeholder="MM/AA"
          hint="Mes y año, como 12/28."
        />
        <PaymentInput state={state} field="cvc" label="CVC" autoComplete="cc-csc" type="password" />
      </div>
      <PaymentInput state={state} field="nit" label="NIT para la factura" autoComplete="off" />
      <Button type="submit" loading={state.submitting} className="w-full">
        {state.submitting ? 'Procesando pago…' : `Pagar ${formatGtq(plan.priceCents)}`}
      </Button>
    </form>
  );
}

function PaymentCard({
  plan,
  state,
}: {
  readonly plan: Plan;
  readonly state: PaymentFormState;
}): JSX.Element {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <PaymentHeader />
      <OutcomeAlert state={state} />
      <PaymentFields plan={plan} state={state} />
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Tarjetas de prueba: 4242 4242 4242 4242 aprueba · 4000 0000 0000 0002 rechaza.
      </p>
    </Card>
  );
}

interface PaymentInputProps {
  readonly state: PaymentFormState;
  readonly field: PaymentField;
  readonly label: string;
  readonly autoComplete: string;
  readonly type?: 'text' | 'password';
  readonly placeholder?: string;
  /** Ayuda bajo el campo, ligada con `aria-describedby` junto al error (el formato no queda solo en el placeholder). */
  readonly hint?: string;
  /** Algo que se pinta dentro del campo, a la derecha (la marca de la tarjeta). */
  readonly adornment?: React.ReactNode;
  readonly onValueChange?: (value: string) => void;
}

/** La ayuda y el error del campo, en ese orden, para `aria-describedby` (el `Input` nombra el error `{id}-error`). */
const describedByOf = (id: string, hasHint: boolean, hasError: boolean): string | undefined => {
  const ids = [hasHint ? `${id}-ayuda` : null, hasError ? `${id}-error` : null].filter(Boolean);
  return ids.length === 0 ? undefined : ids.join(' ');
};

/** `register` de react-hook-form; con `onValueChange`, además reescribe el valor (el número agrupado). */
const registerField = (
  state: PaymentFormState,
  field: PaymentField,
  onValueChange: PaymentInputProps['onValueChange'],
) =>
  state.form.register(
    field,
    onValueChange === undefined
      ? {}
      : {
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            onValueChange(event.target.value),
        },
  );

function Adornment({ children }: { readonly children: React.ReactNode }): JSX.Element {
  return (
    <span className="pointer-events-none absolute right-3 top-0 flex h-11 items-center">
      {children}
    </span>
  );
}

/** El `Input` del campo con su error, su ayuda en `aria-describedby` y, si hay, el adorno a la derecha. */
function FieldControl({
  state,
  field,
  hint,
  adornment,
  onValueChange,
  ...input
}: PaymentInputProps): JSX.Element {
  const id = `pago-${field}`;
  const message = state.form.formState.errors[field]?.message;
  const describedBy = describedByOf(id, hint !== undefined, message !== undefined);
  return (
    <div className="relative">
      <Input
        id={id}
        type={input.type ?? 'text'}
        inputMode={field === 'nit' ? 'text' : 'numeric'}
        autoComplete={input.autoComplete}
        placeholder={input.placeholder}
        readOnly={state.submitting}
        className={adornment === undefined ? undefined : 'pr-16'}
        {...(message === undefined ? {} : { errorMessage: message })}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
        {...registerField(state, field, onValueChange)}
      />
      {adornment === undefined ? null : <Adornment>{adornment}</Adornment>}
    </div>
  );
}

function PaymentInput(props: PaymentInputProps): JSX.Element {
  const id = `pago-${props.field}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <FieldControl {...props} />
      {props.hint === undefined ? null : (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {props.hint}
        </p>
      )}
    </div>
  );
}

/** Número de tarjeta como el mockup: se agrupa de 4 en 4 al escribir y muestra la marca dentro del campo. */
function CardNumberInput({ state }: { readonly state: PaymentFormState }): JSX.Element {
  const brand = cardBrandOf(state.form.watch('number'));
  return (
    <PaymentInput
      state={state}
      field="number"
      label="Número de tarjeta"
      autoComplete="cc-number"
      onValueChange={(value) => state.form.setValue('number', groupCardNumber(value))}
      adornment={
        brand === null ? undefined : <Badge variant="secondary">{brand.toUpperCase()}</Badge>
      }
    />
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

/** Aprobado (CA-3, CA-6): referencia `SIM-`, plan activo, vencimiento y a dónde se envió el comprobante (spec §6). */
function ApprovedCard({ payment }: { readonly payment: SubscribeResponse }): JSX.Element {
  return (
    <Card className="flex flex-col items-start gap-4 p-6" data-state="aprobado">
      <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-success-foreground" />
      <h1 className="text-xl font-bold text-foreground">Pago aprobado</h1>
      <p className="text-sm text-foreground">
        Tu plan {payment.plan.name} ya está activo. Te enviamos el comprobante a{' '}
        {payment.receiptEmail}.
      </p>
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
