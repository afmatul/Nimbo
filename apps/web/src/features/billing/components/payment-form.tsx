'use client';

import {
  BILLING_ERROR_CODES,
  formatGtq,
  TEST_CARDS,
  type PaymentReceipt,
  type Plan,
} from '@nimbo/contracts';
import { AlertCircle, CircleCheck, CircleX, RefreshCcw, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import type { JSX } from 'react';

import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { messageForCode } from '../../../lib/error-catalog';
import { lastDayLabel } from '../../../lib/format-date';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import type { AuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { MY_FILES_PATH } from '../../storage/routes';
import { usePaymentForm, type PaymentFormState } from '../hooks/use-payment-form';
import {
  cardBrandOf,
  groupCardNumber,
  toSubscribeRequest,
  type PaymentField,
} from '../payment-form-values';
import { subscribe } from '../subscribe-api';

import { ApprovedCard } from './approved-card';
import { PaymentSummary, type PeriodNote } from './payment-summary';

export interface PaymentFormProps {
  readonly plan: Plan;
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
}

export interface PaymentScreenProps {
  readonly plan: Plan;
  /** «Pago» al contratar (009) o «Renovar tu plan» (010). */
  readonly title: string;
  readonly state: PaymentFormState;
  /** El periodo nuevo de la renovación en el resumen (010 CA-8, CA-10). */
  readonly period?: PeriodNote;
  readonly approved: (payment: PaymentReceipt) => JSX.Element;
}

/**
 * Pantalla de pago (spec 009 §6; 010 CA-8 a CA-10; mockups `billing/pago/`): formulario o aprobado, y el resumen del
 * plan al lado. La comparten contratar y renovar.
 */
export function PaymentScreen({
  plan,
  title,
  state,
  period,
  approved,
}: PaymentScreenProps): JSX.Element {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {state.outcome.kind === 'approved' ? (
        approved(state.outcome.payment)
      ) : (
        <PaymentCard plan={plan} title={title} state={state} />
      )}
      <PaymentSummary plan={plan} {...(period === undefined ? {} : { period })} />
    </div>
  );
}

/** Contratar un plan (spec 009 CA-3 a CA-6). */
export function PaymentForm({ plan, apiPublicUrl, authFetch }: PaymentFormProps): JSX.Element {
  const state = usePaymentForm({
    prepare: (values) => toSubscribeRequest(plan.slug, values),
    pay: (request) => subscribe(apiPublicUrl, authFetch, request),
  });
  return (
    <PaymentScreen
      plan={plan}
      title="Pago"
      state={state}
      approved={(payment) => (
        <ApprovedCard
          message={`Tu plan ${payment.plan.name} ya está activo. Te enviamos el comprobante a ${payment.receiptEmail}.`}
          receipt={{
            payment,
            facts: [
              { label: 'Referencia', value: payment.reference },
              { label: 'Vence el', value: lastDayLabel(payment.expiresAt) },
            ],
          }}
          link={{ href: MY_FILES_PATH, label: 'Ir a Mis archivos' }}
        />
      )}
    />
  );
}

/** La misma pantalla con la sesión en memoria (`SessionProvider`), para la página. */
export function SessionPaymentForm(props: Omit<PaymentFormProps, 'authFetch'>): JSX.Element {
  const authFetch = useAuthFetch();
  return <PaymentForm {...props} authFetch={authFetch} />;
}

function PaymentHeader({ title }: { readonly title: string }): JSX.Element {
  return (
    <header className="space-y-1">
      <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
        {title} <Badge variant="warning">Simulado</Badge>
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

interface TestCardOption {
  readonly number: string;
  readonly outcome: string;
  readonly Icon: LucideIcon;
  readonly iconClass: string;
}

/** Las tres tarjetas del simulador (009 RN-3; 010 RN-2, B-2), con los números de `contracts`. */
const TEST_CARD_OPTIONS: readonly TestCardOption[] = [
  {
    number: TEST_CARDS.approved,
    outcome: 'aprueba',
    Icon: CircleCheck,
    iconClass: 'text-success-foreground',
  },
  {
    number: TEST_CARDS.rejected,
    outcome: 'rechaza',
    Icon: CircleX,
    iconClass: 'text-destructive',
  },
  {
    number: TEST_CARDS.recurringDeclined,
    outcome: 'aprueba; falla el cobro automático',
    Icon: RefreshCcw,
    iconClass: 'text-warning-foreground',
  },
];

const TEST_CVC = '123';
const TEST_EXPIRY_YEARS_AHEAD = 3;

/** «12/29»: diciembre de dentro de unos años, siempre vigente para el simulador. */
const testExpiry = (): string =>
  `12/${String((new Date().getFullYear() + TEST_EXPIRY_YEARS_AHEAD) % 100).padStart(2, '0')}`;

/** Llena número, vencimiento y CVC con la tarjeta de prueba elegida; el NIT queda como esté. */
function fillTestCard(state: PaymentFormState, number: string): void {
  const options = { shouldDirty: true } as const;
  state.form.setValue('number', groupCardNumber(number), options);
  state.form.setValue('expiry', testExpiry(), options);
  state.form.setValue('cvc', TEST_CVC, options);
  state.form.clearErrors();
}

function TestCardChip({
  card,
  disabled,
  onPick,
}: {
  readonly card: TestCardOption;
  readonly disabled: boolean;
  readonly onPick: (number: string) => void;
}): JSX.Element {
  const grouped = groupCardNumber(card.number);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Usar la tarjeta ${grouped}: ${card.outcome}`}
      onClick={() => onPick(card.number)}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <card.Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${card.iconClass}`} />
      <span className="font-mono font-semibold tabular-nums">{grouped}</span>
      <span className="text-muted-foreground">· {card.outcome}</span>
    </button>
  );
}

/** Atajos del simulador: un clic llena el formulario con la tarjeta y dice qué resultado da. */
function TestCardsHelp({ state }: { readonly state: PaymentFormState }): JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Tarjetas de prueba · toca una para llenar el formulario
      </p>
      <div className="flex flex-wrap gap-2">
        {TEST_CARD_OPTIONS.map((card) => (
          <TestCardChip
            key={card.number}
            card={card}
            disabled={state.submitting}
            onPick={(number) => fillTestCard(state, number)}
          />
        ))}
      </div>
    </div>
  );
}

function PaymentCard({
  plan,
  title,
  state,
}: {
  readonly plan: Plan;
  readonly title: string;
  readonly state: PaymentFormState;
}): JSX.Element {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <PaymentHeader title={title} />
      <OutcomeAlert state={state} />
      <PaymentFields plan={plan} state={state} />
      <TestCardsHelp state={state} />
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
