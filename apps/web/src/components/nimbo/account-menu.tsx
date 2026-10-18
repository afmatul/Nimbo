'use client';

import { CreditCard, History, LogOut, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

import { ConfirmDestructiveDialog } from './confirm-destructive-dialog';

const SECURITY_HREF = '/cuenta/seguridad';
const ACTIVITY_HREF = '/actividad';

/** Confirmación de cerrar la sesión de este dispositivo (spec 002 §11, CA-14): la misma en Seguridad y en el menú. */
export const SIGN_OUT_CONFIRMATION = {
  title: '¿Cerrar la sesión en este dispositivo?',
  description: 'Tendrás que iniciar sesión de nuevo para volver a entrar.',
  confirmLabel: 'Cerrar sesión',
} as const;

/**
 * El `Content` de Radix pierde su rol y deja de nombrarse por el botón: así el nombre y el correo quedan fuera del
 * `role="menu"` (plan 002 §6.9) y el menú interior conserva el teclado de Radix.
 */
const CONTENT_WITHOUT_MENU_ROLE = {
  role: undefined,
  'aria-orientation': undefined,
  'aria-labelledby': undefined,
} as const;

export interface AccountMenuProps {
  readonly fullName: string;
  readonly email: string;
  /** Cierra la sesión; quien lo provee decide adónde se va después. */
  readonly onSignOut: () => Promise<void>;
  /** Ruta de «Mi actividad» del rol de la sesión (011 CA-17); opcional: por omisión, la del cliente (004). */
  readonly activityHref?: string;
  /** Ruta de «Plan y facturación» (009); solo la recibe un cliente: sin ella, el ítem no se ofrece. */
  readonly billingHref?: string;
}

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

interface AccountTriggerProps {
  readonly id: string;
  readonly buttonRef: React.Ref<HTMLButtonElement>;
  readonly fullName: string;
}

function AccountTrigger({ id, buttonRef, fullName }: AccountTriggerProps): React.JSX.Element {
  return (
    <DropdownMenuTrigger
      ref={buttonRef}
      id={id}
      aria-label={`Menú de la cuenta de ${fullName}`}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
    >
      <span className="hidden max-w-48 truncate sm:inline">{fullName}</span>
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs font-bold text-foreground ring-2 ring-primary"
      >
        {initialsOf(fullName)}
      </span>
    </DropdownMenuTrigger>
  );
}

interface AccountItemsProps {
  readonly triggerId: string;
  readonly activityHref: string;
  readonly billingHref: string | undefined;
  readonly onSignOut: () => void;
}

function BillingItem({ href }: { readonly href: string | undefined }): React.JSX.Element | null {
  if (href === undefined) return null;
  return (
    <DropdownMenuItem asChild>
      <a href={href}>
        <CreditCard aria-hidden="true" className="h-4 w-4 text-secondary-foreground" />
        Plan y facturación
      </a>
    </DropdownMenuItem>
  );
}

function AccountItems({
  triggerId,
  activityHref,
  billingHref,
  onSignOut,
}: AccountItemsProps): React.JSX.Element {
  return (
    <div role="menu" aria-orientation="vertical" aria-labelledby={triggerId}>
      <DropdownMenuItem asChild>
        <a href={SECURITY_HREF}>
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-secondary-foreground" />
          Seguridad
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={activityHref}>
          <History aria-hidden="true" className="h-4 w-4 text-secondary-foreground" />
          Mi actividad
        </a>
      </DropdownMenuItem>
      <BillingItem href={billingHref} />
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onSignOut}>
        <LogOut aria-hidden="true" className="h-4 w-4 text-secondary-foreground" />
        Cerrar sesión
      </DropdownMenuItem>
    </div>
  );
}

/**
 * Confirmación de cierre (CA-14): mientras se cierra la sesión, el diálogo sigue abierto y bloqueado. Al cerrarse, el
 * foco vuelve al botón de la cuenta: el diálogo no tiene disparador propio y el ítem que lo abrió ya no existe.
 */
function useSignOutConfirmation(
  onSignOut: () => Promise<void>,
  returnFocusTo: React.RefObject<HTMLButtonElement | null>,
) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !open) returnFocusTo.current?.focus();
    wasOpen.current = open;
  }, [open, returnFocusTo]);
  const confirm = async (): Promise<void> => {
    setPending(true);
    await onSignOut();
    setPending(false);
    setOpen(false);
  };
  return { open, setOpen, pending, confirm };
}

/**
 * Menú de la cuenta en la cabecera del `AppLayout` (spec 002, CA-14, CA-27; mockup `shared/layout`): patrón *menu
 * button* de WAI-ARIA sobre el `DropdownMenu` de Radix, con el nombre y el correo arriba, «Seguridad», «Mi actividad»
 * (004), «Plan y facturación» solo si llega su ruta (009, para clientes) y «Cerrar sesión», que pide confirmación (Q-3).
 */
export function AccountMenu({
  fullName,
  email,
  onSignOut,
  activityHref = ACTIVITY_HREF,
  billingHref,
}: AccountMenuProps): React.JSX.Element {
  const triggerId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const confirmation = useSignOutConfirmation(onSignOut, triggerRef);
  return (
    <>
      <DropdownMenu>
        <AccountTrigger id={triggerId} buttonRef={triggerRef} fullName={fullName} />
        <DropdownMenuContent align="end" loop className="w-68 p-1.5" {...CONTENT_WITHOUT_MENU_ROLE}>
          <div className="mb-1.5 border-b border-border px-3 pb-3 pt-2.5">
            <p className="text-sm font-semibold text-foreground">{fullName}</p>
            <p className="break-all text-sm text-muted-foreground">{email}</p>
          </div>
          <AccountItems
            triggerId={triggerId}
            activityHref={activityHref}
            billingHref={billingHref}
            onSignOut={() => confirmation.setOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDestructiveDialog
        open={confirmation.open}
        onOpenChange={confirmation.setOpen}
        onConfirm={() => void confirmation.confirm()}
        pending={confirmation.pending}
        {...SIGN_OUT_CONFIRMATION}
      />
    </>
  );
}
