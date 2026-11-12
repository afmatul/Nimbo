'use client';

import type { PublicLinkSummary } from '@nimbo/contracts';
import { AlertTriangle } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';

import { PublicLinkForm, type PublicLinkFormProps } from './public-link-form';

const REPLACE_WARNING = 'El enlace actual dejará de funcionar para quien lo tenga.';

/** Lo que el formulario necesita de la sección, igual al crear que al reemplazar. */
export type LinkFormHandlers = Omit<PublicLinkFormProps, 'replacing'>;

export interface LinkFormPanelProps {
  /** El enlace que se reemplaza; `null` al crear. */
  readonly link: PublicLinkSummary | null;
  readonly form: LinkFormHandlers;
}

/** El formulario de crear o de reemplazar; reemplazar un enlace activo lleva la advertencia (013c CA-8, D-5). */
export function LinkFormPanel({ link, form }: LinkFormPanelProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      {link?.status === 'active' ? (
        <Alert variant="warning" className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1">{REPLACE_WARNING}</p>
        </Alert>
      ) : null}
      <PublicLinkForm {...form} replacing={link !== null} />
    </div>
  );
}
