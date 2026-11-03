'use client';

import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button, buttonVariants } from '../../../components/ui/button';
import { RENEW_PATH } from '../../billing/routes';
import { SHARE_FIX_LABELS, type ShareFix, type ShareMessage } from '../share-messages';

/** Qué hace cada acción correctiva en la pantalla que muestra el error; sin manejador, no hay botón. */
export type ShareFixHandlers = Partial<Record<Exclude<ShareFix, 'renew' | 'wait'>, () => void>>;

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

/** Error de compartir, quitar o salir con su acción correctiva (spec 012b CA-3, CA-11; texto del catálogo, RN-2). */
export function ShareErrorAlert({
  message,
  handlers = {},
}: {
  readonly message: ShareMessage;
  readonly handlers?: ShareFixHandlers;
}): React.JSX.Element {
  return (
    <Alert variant="error" className="flex flex-wrap items-start gap-3">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-48 break-words">{message.title}</p>
      <FixAction fix={message.fix} handlers={handlers} />
    </Alert>
  );
}
