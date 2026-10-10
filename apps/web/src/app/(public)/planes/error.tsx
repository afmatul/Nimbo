'use client';

import { BILLING_ERROR_CODES } from '@nimbo/contracts';
import { useRouter } from 'next/navigation';
import { startTransition, type ReactNode } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { messageForCode } from '../../../lib/error-catalog';

interface PlanesErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/**
 * Error de la página de planes (008 CA-3). Next registra el error en el servidor; «Recargar» vuelve a leer el catálogo
 * (`refresh`) y rehace el segmento (`reset`).
 */
export default function PlanesError({ reset }: PlanesErrorProps): ReactNode {
  const router = useRouter();
  const retry = (): void => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div className="p-6">
      <StateView
        type="error"
        title={messageForCode(BILLING_ERROR_CODES.BILLING_PLAN_CATALOG_UNAVAILABLE)}
        headingLevel="h2"
        action={{ label: 'Recargar', onClick: retry }}
      />
    </div>
  );
}
