'use client';

import type { SubscriptionView } from '@nimbo/contracts';
import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Switch } from '../../../components/ui/switch';

import { cardLabel, expiryLabel, type Card } from './subscription-copy';

export interface AutoRenewSwitchProps {
  readonly subscription: SubscriptionView;
  readonly card: Card | null;
  readonly pending: boolean;
  readonly onChange: (enabled: boolean) => void;
}

/** La ayuda bajo la etiqueta (mockups `vigente`, `renovacion-desactivada`, `vencida`). */
const helpText = ({ subscription, card }: Omit<AutoRenewSwitchProps, 'pending' | 'onChange'>) => {
  if (subscription.status === 'readOnly') return 'Podrás activarla cuando renueves tu plan.';
  if (subscription.autoRenew) {
    return `Cobraremos tu plan con la tarjeta de tu último pago aprobado. Si la desactivas, conservas tu plan hasta el ${expiryLabel(subscription)}.`;
  }
  return card === null
    ? 'Actívala para renovar con la tarjeta de tu próximo pago.'
    : `Actívala para renovar con ${cardLabel(card)}, la tarjeta de tu último pago.`;
};

function ConfirmDisable({
  subscription,
  open,
  onOpenChange,
  onConfirm,
}: {
  readonly subscription: SubscriptionView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar la renovación automática?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Tu plan ${subscription.plan.name} sigue activo hasta el ${expiryLabel(subscription)}. Si no renuevas antes, tu cuenta quedará en solo lectura: podrás ver y descargar tus archivos, pero no subir ni editar.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Desactivar renovación</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Renovación automática (spec 010 CA-6, RN-3): interruptor con el estado también en texto; apagarlo pide confirmación con
 * la consecuencia, encenderlo no. En solo lectura queda deshabilitado con su explicación.
 */
export function AutoRenewSwitch(props: AutoRenewSwitchProps): React.JSX.Element {
  const { subscription, pending, onChange } = props;
  const [confirming, setConfirming] = React.useState(false);
  const disabled = pending || subscription.status === 'readOnly';
  const toggle = (enabled: boolean): void => (enabled ? onChange(true) : setConfirming(true));
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p id="renovacion-automatica" className="text-sm font-semibold text-foreground">
          Renovación automática
        </p>
        <p className="text-sm text-secondary-foreground">{helpText(props)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Switch
          checked={subscription.autoRenew && subscription.status !== 'readOnly'}
          onCheckedChange={toggle}
          disabled={disabled}
          aria-labelledby="renovacion-automatica"
        />
        <span className="text-sm font-medium text-foreground">
          {subscription.autoRenew && subscription.status !== 'readOnly'
            ? 'Activada'
            : 'Desactivada'}
        </span>
      </div>
      <ConfirmDisable
        subscription={subscription}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => onChange(false)}
      />
    </div>
  );
}
