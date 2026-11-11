'use client';

import { AlertCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button, buttonVariants } from '../../../components/ui/button';
import { RENEW_PATH } from '../../billing/routes';
import { SHARE_FIX_LABELS, type ShareFix, type ShareMessage } from '../share-messages';

/** Qué hace cada acción correctiva en la pantalla que muestra el error; sin manejador, no hay botón. */
export type ShareFixHandlers = Partial<
  Record<Exclude<ShareFix, 'renew' | 'wait' | 'none'>, () => void>
>;

function FixAction({
  fix,
  handlers,
}: {
  readonly fix: ShareFix;
  readonly handlers: ShareFixHandlers;
}): React.JSX.Element | null {
  const label = SHARE_FIX_LABELS[fix];
  if (label === null) return null;
  if (fix === 'renew') {
    return (
      <Link href={RENEW_PATH} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        {label}
      </Link>
    );
  }
  const onFix = handlers[fix as keyof ShareFixHandlers];
  if (onFix === undefined) return null;
  return (
    <Button type="button" variant="outline" size="sm" className="text-foreground" onClick={onFix}>
      {label}
    </Button>
  );
}

/** `warning`: el tono del catálogo para el `429` del enlace público (013c CA-12, I-4); por omisión, error. */
export type ShareErrorVariant = 'error' | 'warning';

const iconClass = 'mt-0.5 h-5 w-5 shrink-0';

/** Error de compartir, quitar o salir con su acción correctiva (spec 012b CA-3, CA-11; texto del catálogo, RN-2). */
export function ShareErrorAlert({
  message,
  handlers = {},
  variant = 'error',
}: {
  readonly message: ShareMessage;
  readonly handlers?: ShareFixHandlers;
  readonly variant?: ShareErrorVariant;
}): React.JSX.Element {
  const Icon = variant === 'warning' ? Clock : AlertCircle;
  return (
    <Alert variant={variant} className="flex flex-wrap items-start gap-3">
      <Icon className={iconClass} aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-48 break-words">{message.title}</p>
      <FixAction fix={message.fix} handlers={handlers} />
    </Alert>
  );
}
