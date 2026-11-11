'use client';

import {
  SHARED_ERROR_CODES,
  STORAGE_ERROR_CODES,
  STORAGE_PREVIEW_FAILURE_CODES,
} from '@nimbo/contracts';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { StateView } from '../../../../components/nimbo/state-view';
import { Alert } from '../../../../components/ui/alert';
import { Button, buttonVariants } from '../../../../components/ui/button';
import { messageForCode, storageMessage } from '../../../../lib/error-catalog';
import type { PreviewState } from '../hooks/use-preview';
import type { PreviewFailure, PreviewFailureReason } from '../preview-failure';

export type PreviewStatesProps = {
  readonly state: PreviewState;
  readonly onRetry: () => void;
  readonly onDownload: () => void;
  readonly returnHref: string;
  readonly downloadPending?: boolean;
};

const FAILURE_CODES: Partial<Record<PreviewFailureReason, string>> = {
  unsupported: STORAGE_ERROR_CODES.STORAGE_PREVIEW_UNSUPPORTED,
  'rate-limited': STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS,
  forbidden: SHARED_ERROR_CODES.FORBIDDEN,
  unauthenticated: SHARED_ERROR_CODES.UNAUTHENTICATED,
  protected: STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_PASSWORD_PROTECTED,
  corrupt: STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_CORRUPT,
  unavailable: STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_UNAVAILABLE,
  memory: STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_UNAVAILABLE,
  expired: STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_EXPIRED,
};

function LoadingState({ prolonged }: { readonly prolonged: boolean }): React.JSX.Element {
  return (
    <>
      <StateView
        type="loading"
        headingLevel="h2"
        title={prolonged ? 'Preparando la vista previa…' : 'Abriendo la vista previa…'}
      />
      {prolonged ? (
        <div
          role="progressbar"
          aria-label="Preparando la vista previa"
          className="mt-4 h-2 overflow-hidden rounded-full border border-input bg-muted"
        >
          <span className="block h-full w-1/3 bg-primary motion-safe:animate-pulse" />
        </div>
      ) : null}
    </>
  );
}

function failureMessage(failure: PreviewFailure): {
  readonly title: string;
  readonly description: string;
} {
  if (failure.reason === 'not-found')
    return {
      title: 'No encontramos este archivo.',
      description:
        'Puede que esté en la papelera, que ya no tengas acceso o que el enlace no sea correcto.',
    };
  if (failure.reason === 'network')
    return {
      title: 'No pudimos cargar la vista previa.',
      description:
        'Revisa tu conexión e inténtalo de nuevo. Tus archivos siguen guardados y puedes descargar este mientras tanto.',
    };
  const code = FAILURE_CODES[failure.reason] ?? 'INTERNAL_ERROR';
  const storage = storageMessage(code);
  return storage === null
    ? {
        title: 'No pudimos cargar la vista previa.',
        description: messageForCode(code, { correlationId: failure.correlationId }),
      }
    : { title: storage.cause, description: storage.fix };
}

type FailureStateProps = Omit<PreviewStatesProps, 'state'> & { readonly failure: PreviewFailure };

function FailureActions(props: FailureStateProps): React.JSX.Element {
  if (['not-found', 'forbidden', 'unauthenticated'].includes(props.failure.reason))
    return (
      <Link href={props.returnHref} prefetch={false} className={buttonVariants()}>
        Ir a Mis archivos
      </Link>
    );
  const downloadFirst = ['unsupported', 'protected', 'corrupt', 'unavailable', 'memory'].includes(
    props.failure.reason,
  );
  const actions = downloadFirst ? ['download', 'retry'] : ['retry', 'download'];
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {actions.map((action, index) => (
        <Button
          key={action}
          type="button"
          variant={index === 0 ? 'default' : 'outline'}
          onClick={action === 'download' ? props.onDownload : props.onRetry}
          disabled={action === 'download' ? props.downloadPending : undefined}
        >
          {action === 'download' ? 'Descargar' : 'Reintentar'}
        </Button>
      ))}
    </div>
  );
}

function FailureState(props: FailureStateProps): React.JSX.Element {
  const { failure } = props;
  const message = failureMessage(failure);
  const variant =
    failure.reason === 'rate-limited'
      ? 'warning'
      : ['network', 'unexpected', 'corrupt'].includes(failure.reason)
        ? 'error'
        : 'info';
  return (
    <Alert variant={variant} className="space-y-4 p-6">
      <AlertCircle className="h-5 w-5" aria-hidden="true" />
      <h2 className="text-base font-semibold">{message.title}</h2>
      <p className="text-foreground">{message.description}</p>
      <FailureActions {...props} failure={failure} />
    </Alert>
  );
}

export function PreviewStates(props: PreviewStatesProps): React.JSX.Element | null {
  const { state } = props;
  if (state.status === 'idle' || state.status === 'loading') {
    return <LoadingState prolonged={state.status === 'loading' && state.prolonged} />;
  }
  return state.status === 'failure' ? <FailureState {...props} failure={state.failure} /> : null;
}
