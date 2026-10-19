'use client';

import { Eye, Lock, Pencil } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button, buttonVariants } from '../../../components/ui/button';
import type { ReadOnlyCopy } from '../read-only-copy';
import { PLANS_PATH } from '../routes';

export interface ReadOnlyNoticeProps {
  readonly copy: ReadOnlyCopy;
  /** «Intentar editar» (límite alcanzado, CA-7): repite la apertura. */
  readonly onRetry: () => void;
}

const TITLE_ID = 'aviso-solo-lectura';
const ACTION_CLASS = 'w-full sm:w-auto';

/**
 * Aviso persistente de solo lectura (no se cierra mientras dure la causa): `info` para el lector, `warning` para un
 * límite, que no es un error. Nombrado por su título para los lectores de pantalla.
 */
export function ReadOnlyNotice({ copy, onRetry }: ReadOnlyNoticeProps): React.JSX.Element {
  const Icon = copy.tone === 'info' ? Eye : Lock;
  return (
    <Alert
      variant={copy.tone}
      aria-labelledby={TITLE_ID}
      className="flex flex-wrap items-start gap-3"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        <p id={TITLE_ID} className="font-semibold">
          {copy.title}
        </p>
        <p className="mt-0.5 text-foreground">{copy.description}</p>
      </div>
      <NoticeAction copy={copy} onRetry={onRetry} />
    </Alert>
  );
}

function NoticeAction({ copy, onRetry }: ReadOnlyNoticeProps): React.JSX.Element | null {
  if (copy.action === 'plans') {
    return (
      <Link href={PLANS_PATH} className={buttonVariants({ size: 'sm', className: ACTION_CLASS })}>
        Ver planes
      </Link>
    );
  }
  if (copy.action === 'retry') {
    return (
      <Button type="button" variant="outline" size="sm" className={ACTION_CLASS} onClick={onRetry}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Intentar editar
      </Button>
    );
  }
  return null;
}
